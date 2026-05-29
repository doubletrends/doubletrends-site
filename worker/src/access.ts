/**
 * Pure access-control helpers — no I/O, no Telegram/Stripe/D1 calls.
 *
 * These hold the bug-prone decision logic (which /start commands grant access,
 * whose token is whose, who is still paying) so it can be unit-tested in plain
 * Node without a live Worker. index.ts wires these to the actual side effects.
 */

export interface SubscriberRow {
  stripe_customer_id: string;
  subscription_id: string | null;
  claim_token: string | null;
  invite_link: string | null;
  telegram_user_id: string | null;
  status: string | null;
}

/** Parse the text of a Telegram private message into a command + optional arg. */
export function parseCommand(text: string | undefined): { command: string; arg: string | null } {
  if (!text) {
    return { command: "", arg: null };
  }
  const trimmed = text.trim();
  // Telegram deep links arrive as "/start <payload>"; commands may carry an
  // "@botname" suffix in groups (e.g. "/link@DoubleTrendsBot").
  const [rawCommand, ...rest] = trimmed.split(/\s+/);
  const command = rawCommand.split("@")[0].toLowerCase();
  const arg = rest.length > 0 ? rest.join(" ") : null;
  return { command, arg };
}

export type ClaimDecision =
  | { kind: "not_found" }
  | { kind: "wrong_user" }
  | { kind: "inactive" }
  | { kind: "grant"; needsBind: boolean };

/**
 * Decide what to do when a user sends `/start <token>`.
 * `row` is the subscriber matched by claim_token (or null if no match).
 */
export function decideClaim(row: SubscriberRow | null, fromUserId: string): ClaimDecision {
  if (!row) {
    return { kind: "not_found" };
  }
  // Token already activated by a different Telegram account → never hand it over.
  if (row.telegram_user_id && row.telegram_user_id !== fromUserId) {
    return { kind: "wrong_user" };
  }
  if (row.status !== "active") {
    return { kind: "inactive" };
  }
  return { kind: "grant", needsBind: !row.telegram_user_id };
}

export type AccessDecision =
  | { kind: "not_subscribed" }
  | { kind: "inactive" }
  | { kind: "active" };

/**
 * Shared subscriber-state check. Used by /status (to report state) and /brief
 * (to gate access to subscriber-only content). `row` is matched by
 * telegram_user_id (or null if unknown).
 */
export function decideAccess(row: SubscriberRow | null): AccessDecision {
  if (!row) {
    return { kind: "not_subscribed" };
  }
  if (row.status !== "active") {
    return { kind: "inactive" };
  }
  return { kind: "active" };
}

/** Build the t.me deep link a freshly-paid customer taps to activate. */
export function buildDeepLink(botUsername: string, token: string): string {
  const handle = botUsername.replace(/^@/, "");
  return `https://t.me/${handle}?start=${encodeURIComponent(token)}`;
}

/** Cryptographically-random, URL-safe activation token. */
export function generateToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
