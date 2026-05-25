interface Env {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHANNEL_ID: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRICE_ID: string;
  TELEGRAM_WEBHOOK_SECRET: string;
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

interface Subscriber {
  stripe_customer_id: string;
  subscription_id: string | null;
  telegram_user_id: string | null;
}

interface TelegramInviteLinkResponse {
  ok: boolean;
  result?: {
    invite_link?: string;
  };
  description?: string;
}

interface TelegramUpdate {
  chat_member?: {
    invite_link?: {
      invite_link?: string;
    };
    new_chat_member?: {
      user?: {
        id?: number;
      };
    };
  };
  chat_join_request?: {
    invite_link?: {
      invite_link?: string;
    };
    from?: {
      id?: number;
    };
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

    return json({ error: "not found" }, 404);
  },
};

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

  const invite = await telegramApi<TelegramInviteLinkResponse>(
    "createChatInviteLink",
    {
      chat_id: env.TELEGRAM_CHANNEL_ID,
      member_limit: 1,
    },
    env,
  );

  const inviteLink = invite.result?.invite_link;
  if (!invite.ok || !inviteLink) {
    throw new Error(invite.description ?? "Telegram invite link creation failed");
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO subscribers (
      stripe_customer_id,
      subscription_id,
      checkout_session_id,
      invite_link,
      telegram_user_id,
      status,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, NULL, 'active', ?, ?)
    ON CONFLICT(stripe_customer_id) DO UPDATE SET
      subscription_id = excluded.subscription_id,
      checkout_session_id = excluded.checkout_session_id,
      invite_link = excluded.invite_link,
      status = 'active',
      updated_at = excluded.updated_at`,
  )
    .bind(customerId, subscriptionId ?? null, checkoutSessionId, inviteLink, now, now)
    .run();
}

async function handleSubscriptionInactive(
  object: StripeObject,
  status: "canceled" | "past_due",
  env: Env,
): Promise<void> {
  const customerId = object.customer;
  const subscriptionId = object.subscription ?? object.id;
  const row = await findSubscriber(customerId, subscriptionId, env);
  const now = new Date().toISOString();

  if (row) {
    await env.DB.prepare(
      `UPDATE subscribers
      SET status = ?, updated_at = ?
      WHERE stripe_customer_id = ?`,
    )
      .bind(status, now, row.stripe_customer_id)
      .run();

    if (row.telegram_user_id) {
      await removeTelegramMember(row.telegram_user_id, env);
    }
  } else if (customerId || subscriptionId) {
    await env.DB.prepare(
      `UPDATE subscribers
      SET status = ?, updated_at = ?
      WHERE stripe_customer_id = ? OR subscription_id = ?`,
    )
      .bind(status, now, customerId ?? "", subscriptionId ?? "")
      .run();
  }
}

async function findSubscriber(
  customerId: string | undefined,
  subscriptionId: string | undefined,
  env: Env,
): Promise<Subscriber | null> {
  if (!customerId && !subscriptionId) {
    return null;
  }

  return env.DB.prepare(
    `SELECT stripe_customer_id, subscription_id, telegram_user_id
    FROM subscribers
    WHERE stripe_customer_id = ? OR subscription_id = ?
    LIMIT 1`,
  )
    .bind(customerId ?? "", subscriptionId ?? "")
    .first<Subscriber>();
}

async function handleAccess(url: URL, env: Env): Promise<Response> {
  const sessionId = url.searchParams.get("session_id");
  if (!sessionId) {
    return json({ error: "not found" }, 404);
  }

  const row = await env.DB.prepare(
    "SELECT invite_link FROM subscribers WHERE checkout_session_id = ? LIMIT 1",
  )
    .bind(sessionId)
    .first<{ invite_link: string | null }>();

  if (!row?.invite_link) {
    return json({ error: "not found" }, 404);
  }

  return json({ invite_link: row.invite_link });
}

async function handleTelegramWebhook(request: Request, env: Env): Promise<Response> {
  // Telegram echoes the secret_token set at setWebhook time; reject forgeries.
  if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TELEGRAM_WEBHOOK_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  const update = (await request.json()) as TelegramUpdate;
  const inviteLink =
    update.chat_member?.invite_link?.invite_link ??
    update.chat_join_request?.invite_link?.invite_link;
  const userId =
    update.chat_member?.new_chat_member?.user?.id ??
    update.chat_join_request?.from?.id;

  if (inviteLink && userId !== undefined) {
    await env.DB.prepare(
      `UPDATE subscribers
      SET telegram_user_id = ?, updated_at = ?
      WHERE invite_link = ?`,
    )
      .bind(String(userId), new Date().toISOString(), inviteLink)
      .run();
  }

  return json({ ok: true });
}

async function removeTelegramMember(userId: string, env: Env): Promise<void> {
  await telegramApi("banChatMember", {
    chat_id: env.TELEGRAM_CHANNEL_ID,
    user_id: userId,
  }, env);

  await telegramApi("unbanChatMember", {
    chat_id: env.TELEGRAM_CHANNEL_ID,
    user_id: userId,
    only_if_banned: true,
  }, env);
}

async function telegramApi<T = unknown>(
  method: string,
  params: Record<string, unknown>,
  env: Env,
): Promise<T> {
  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(params),
    },
  );

  if (!response.ok) {
    throw new Error(`Telegram API ${method} failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

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
    },
  });
}
