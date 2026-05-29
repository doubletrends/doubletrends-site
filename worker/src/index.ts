import {
  buildDeepLink,
  decideAccess,
  decideClaim,
  generateToken,
  parseCommand,
  type SubscriberRow,
} from "./access";
import {
  formatBriefMessage,
  NO_BRIEF_MESSAGE,
  type BriefSnapshot,
} from "./brief";

interface Env {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_BOT_USERNAME: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRICE_ID: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  BRIEF_SHARED_SECRET: string;
}

interface BriefPayload {
  ticker: string;
  display_name: string;
  as_of_date: string;
  close: number;
  mdd_value: number;
  tier: string;
}

interface StripeEvent {
  type: string;
  data: {
    object: StripeObject;
  };
}

interface StripeObject {
  id?: string;
  customer?: string;
  subscription?: string;
}

interface TelegramUpdate {
  message?: {
    text?: string;
    chat?: { id?: number; type?: string };
    from?: { id?: number };
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/webhook/stripe") {
      return handleStripeWebhook(request, env);
    }

    if (request.method === "GET" && url.pathname === "/access") {
      return handleAccess(url, env);
    }

    if (request.method === "POST" && url.pathname === "/webhook/telegram") {
      return handleTelegramWebhook(request, env);
    }

    if (request.method === "POST" && url.pathname === "/internal/brief") {
      return handleBriefIngest(request, env);
    }

    if (request.method === "GET" && url.pathname === "/internal/subscribers") {
      return handleSubscribersList(request, env);
    }

    return json({ error: "not found" }, 404);
  },
};

// ─── Stripe ───────────────────────────────────────────────────────────────────

async function handleStripeWebhook(request: Request, env: Env): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get("Stripe-Signature");

  if (!(await verifyStripeSignature(rawBody, signature, env.STRIPE_WEBHOOK_SECRET))) {
    return json({ error: "invalid signature" }, 400);
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  if (event.type === "checkout.session.completed") {
    await handleCheckoutCompleted(event.data.object, env);
  } else if (event.type === "customer.subscription.deleted") {
    await handleSubscriptionInactive(event.data.object, "canceled", env);
  } else if (event.type === "invoice.payment_failed") {
    await handleSubscriptionInactive(event.data.object, "past_due", env);
  }

  return json({ ok: true });
}

async function handleCheckoutCompleted(object: StripeObject, env: Env): Promise<void> {
  const checkoutSessionId = object.id;
  const customerId = object.customer;
  const subscriptionId = object.subscription;

  if (!checkoutSessionId || !customerId) {
    return;
  }

  // No Telegram call here — we just mint an activation token. The actual invite
  // link is created on demand when the user taps the deep link and DMs the bot,
  // so a closed tab or an unused link never locks a paying customer out.
  const token = generateToken();
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO subscribers (
      stripe_customer_id,
      subscription_id,
      checkout_session_id,
      claim_token,
      invite_link,
      telegram_user_id,
      status,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, NULL, NULL, 'active', ?, ?)
    ON CONFLICT(stripe_customer_id) DO UPDATE SET
      subscription_id = excluded.subscription_id,
      checkout_session_id = excluded.checkout_session_id,
      claim_token = excluded.claim_token,
      status = 'active',
      updated_at = excluded.updated_at`,
  )
    .bind(customerId, subscriptionId ?? null, checkoutSessionId, token, now, now)
    .run();
}

async function handleSubscriptionInactive(
  object: StripeObject,
  status: "canceled" | "past_due",
  env: Env,
): Promise<void> {
  const customerId = object.customer;
  const subscriptionId = object.subscription ?? object.id;
  if (!customerId && !subscriptionId) {
    return;
  }

  // Flipping status to inactive is enough — signal/brief queries filter by
  // status='active', so the user instantly stops receiving DMs.
  await env.DB.prepare(
    `UPDATE subscribers SET status = ?, updated_at = ?
    WHERE stripe_customer_id = ? OR subscription_id = ?`,
  )
    .bind(status, new Date().toISOString(), customerId ?? "", subscriptionId ?? "")
    .run();
}

// ─── Success page lookup ────────────────────────────────────────────────────────

async function handleAccess(url: URL, env: Env): Promise<Response> {
  const sessionId = url.searchParams.get("session_id");
  if (!sessionId) {
    return json({ error: "not found" }, 404);
  }

  const row = await env.DB.prepare(
    "SELECT claim_token FROM subscribers WHERE checkout_session_id = ? LIMIT 1",
  )
    .bind(sessionId)
    .first<{ claim_token: string | null }>();

  // 404 (not 200-with-null) so the success page keeps polling until the Stripe
  // webhook has written the row.
  if (!row?.claim_token) {
    return json({ error: "not found" }, 404);
  }

  return json({ deep_link: buildDeepLink(env.TELEGRAM_BOT_USERNAME, row.claim_token) });
}

// ─── Telegram ─────────────────────────────────────────────────────────────────

async function handleTelegramWebhook(request: Request, env: Env): Promise<Response> {
  // Telegram echoes the secret_token set at setWebhook time; reject forgeries.
  if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TELEGRAM_WEBHOOK_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  const update = (await request.json()) as TelegramUpdate;

  if (update.message?.chat?.type === "private" && update.message.from?.id !== undefined) {
    await handleBotMessage(
      update.message.text,
      String(update.message.from.id),
      update.message.chat.id ?? update.message.from.id,
      env,
    );
  }

  return json({ ok: true });
}

async function handleBotMessage(
  text: string | undefined,
  fromUserId: string,
  chatId: number,
  env: Env,
): Promise<void> {
  const { command, arg } = parseCommand(text);

  if (command === "/start" && arg) {
    await handleClaim(arg, fromUserId, chatId, env);
    return;
  }

  if (command === "/start" || command === "/status") {
    await handleStatus(fromUserId, chatId, env);
    return;
  }

  if (command === "/brief") {
    await handleBrief(fromUserId, chatId, env);
    return;
  }

  await sendMessage(
    chatId,
    "Send /status to check your subscription, or /brief for the latest market read. " +
      "If you haven't subscribed yet, visit doubletrends.com.",
    env,
  );
}

async function handleBrief(fromUserId: string, chatId: number, env: Env): Promise<void> {
  const subscriber = await findSubscriberByTelegramUser(fromUserId, env);
  const access = decideAccess(subscriber);

  if (access.kind === "not_subscribed") {
    await sendMessage(
      chatId,
      "/brief is a subscriber-only feature. Visit doubletrends.com to subscribe.",
      env,
    );
    return;
  }

  if (access.kind === "inactive") {
    await sendMessage(
      chatId,
      "Your subscription isn't active right now. Contact info@doubletrends.com for help.",
      env,
    );
    return;
  }

  const row = await env.DB.prepare(
    `SELECT ticker, display_name, as_of_date, close_value, mdd_value, tier, updated_at
    FROM brief_snapshot WHERE id = 1 LIMIT 1`,
  ).first<BriefSnapshot>();

  const message = row ? formatBriefMessage(row) : NO_BRIEF_MESSAGE;
  await sendMessage(chatId, message, env);
}

async function findSubscriberByTelegramUser(
  fromUserId: string,
  env: Env,
): Promise<SubscriberRow | null> {
  // A user can accumulate multiple rows over time (subscribe → cancel →
  // resubscribe creates a new stripe_customer_id and a new row, leaving the
  // old canceled row behind with the same telegram_user_id). Prefer the
  // active one, falling back to the most recently updated.
  return env.DB.prepare(
    `SELECT stripe_customer_id, subscription_id, claim_token, invite_link, telegram_user_id, status
    FROM subscribers WHERE telegram_user_id = ?
    ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, updated_at DESC
    LIMIT 1`,
  )
    .bind(fromUserId)
    .first<SubscriberRow>();
}

// ─── Brief ingest (called hourly by the GitHub Actions job) ─────────────────────

async function handleBriefIngest(request: Request, env: Env): Promise<Response> {
  if (request.headers.get("X-Brief-Secret") !== env.BRIEF_SHARED_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  let payload: BriefPayload;
  try {
    payload = (await request.json()) as BriefPayload;
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  if (
    typeof payload.ticker !== "string" ||
    typeof payload.display_name !== "string" ||
    typeof payload.as_of_date !== "string" ||
    typeof payload.tier !== "string" ||
    typeof payload.close !== "number" ||
    typeof payload.mdd_value !== "number" ||
    !Number.isFinite(payload.close) ||
    !Number.isFinite(payload.mdd_value)
  ) {
    return json({ error: "invalid payload" }, 400);
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO brief_snapshot
      (id, ticker, display_name, as_of_date, close_value, mdd_value, tier, updated_at)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      ticker = excluded.ticker,
      display_name = excluded.display_name,
      as_of_date = excluded.as_of_date,
      close_value = excluded.close_value,
      mdd_value = excluded.mdd_value,
      tier = excluded.tier,
      updated_at = excluded.updated_at`,
  )
    .bind(
      payload.ticker,
      payload.display_name,
      payload.as_of_date,
      payload.close,
      payload.mdd_value,
      payload.tier,
      now,
    )
    .run();

  return json({ ok: true });
}

async function handleClaim(
  token: string,
  fromUserId: string,
  chatId: number,
  env: Env,
): Promise<void> {
  const row = await env.DB.prepare(
    `SELECT stripe_customer_id, subscription_id, claim_token, invite_link, telegram_user_id, status
    FROM subscribers WHERE claim_token = ? LIMIT 1`,
  )
    .bind(token)
    .first<SubscriberRow>();

  const decision = decideClaim(row, fromUserId);

  switch (decision.kind) {
    case "not_found":
      await sendMessage(chatId, "That activation link isn't valid. Please use the link shown after checkout, or contact info@doubletrends.com.", env);
      return;
    case "wrong_user":
      await sendMessage(chatId, "This activation link has already been used by another Telegram account. Contact info@doubletrends.com if you need help.", env);
      return;
    case "inactive":
      await sendMessage(chatId, "Your subscription isn't active. If you believe this is a mistake, contact info@doubletrends.com.", env);
      return;
    case "grant": {
      if (decision.needsBind && row) {
        await env.DB.prepare(
          `UPDATE subscribers SET telegram_user_id = ?, updated_at = ? WHERE claim_token = ?`,
        )
          .bind(fromUserId, new Date().toISOString(), token)
          .run();
      }
      await sendMessage(
        chatId,
        "✅ You're all set. Your DoubleTrends™ subscription is active and tied to this Telegram account. " +
          "When the next S&P 500 oversold-reversal signal fires, I'll DM it to you right here. " +
          "Send /brief any time for the latest market read.",
        env,
      );
      return;
    }
  }
}

async function handleStatus(fromUserId: string, chatId: number, env: Env): Promise<void> {
  const row = await findSubscriberByTelegramUser(fromUserId, env);
  const access = decideAccess(row);

  switch (access.kind) {
    case "not_subscribed":
      await sendMessage(
        chatId,
        "You're not currently subscribed. Visit doubletrends.com to subscribe, then tap the activation link shown after checkout.",
        env,
      );
      return;
    case "inactive":
      await sendMessage(
        chatId,
        "Your DoubleTrends™ subscription isn't active right now. Contact info@doubletrends.com for help.",
        env,
      );
      return;
    case "active":
      await sendMessage(
        chatId,
        "✅ Your DoubleTrends™ subscription is active. Signals will arrive here automatically. Send /brief for the latest market read.",
        env,
      );
      return;
  }
}

// ─── Subscribers list (called by signal/notify.py at fire time) ────────────────

async function handleSubscribersList(request: Request, env: Env): Promise<Response> {
  if (request.headers.get("X-Brief-Secret") !== env.BRIEF_SHARED_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  const result = await env.DB.prepare(
    `SELECT telegram_user_id FROM subscribers
    WHERE status = 'active' AND telegram_user_id IS NOT NULL`,
  ).all<{ telegram_user_id: string }>();

  return json({ subscribers: result.results });
}

async function sendMessage(chatId: number, text: string, env: Env): Promise<void> {
  await telegramApi("sendMessage", { chat_id: chatId, text }, env);
}

async function telegramApi<T = unknown>(
  method: string,
  params: Record<string, unknown>,
  env: Env,
): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(`Telegram API ${method} failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

// ─── Stripe signature verification ──────────────────────────────────────────────

async function verifyStripeSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): Promise<boolean> {
  const parts = parseStripeSignature(signature);
  if (!parts) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parts.timestamp) > 300) {
    return false;
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${parts.timestamp}.${rawBody}`),
  );
  const expected = hex(new Uint8Array(digest));

  return timingSafeEqual(expected, parts.signature);
}

function parseStripeSignature(
  signature: string | null,
): { timestamp: number; signature: string } | null {
  if (!signature) {
    return null;
  }

  let timestamp: number | undefined;
  let v1: string | undefined;

  for (const part of signature.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key === "t") {
      timestamp = Number(value);
    } else if (key === "v1") {
      v1 = value;
    }
  }

  if (!timestamp || !Number.isFinite(timestamp) || !v1) {
    return null;
  }

  return { timestamp, signature: v1 };
}

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);

  for (let i = 0; i < length; i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }

  return diff === 0;
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      // The success page fetches /access cross-origin (doubletrends.com → workers.dev).
      "access-control-allow-origin": "*",
    },
  });
}
