import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDeepLink,
  decideAccess,
  decideClaim,
  generateToken,
  parseCommand,
  type SubscriberRow,
} from "../src/access";

function row(overrides: Partial<SubscriberRow> = {}): SubscriberRow {
  return {
    stripe_customer_id: "cus_1",
    subscription_id: "sub_1",
    claim_token: "tok_abc",
    invite_link: null,
    telegram_user_id: null,
    status: "active",
    ...overrides,
  };
}

test("parseCommand splits command and payload", () => {
  assert.deepEqual(parseCommand("/start abc123"), { command: "/start", arg: "abc123" });
  assert.deepEqual(parseCommand("/start"), { command: "/start", arg: null });
  assert.deepEqual(parseCommand("/status"), { command: "/status", arg: null });
  assert.deepEqual(parseCommand(undefined), { command: "", arg: null });
});

test("parseCommand strips @botname and lowercases the command", () => {
  assert.deepEqual(parseCommand("/Status@DoubleTrendsBot"), { command: "/status", arg: null });
  assert.deepEqual(parseCommand("  /START   tok  "), { command: "/start", arg: "tok" });
});

test("decideClaim: unknown token is rejected", () => {
  assert.deepEqual(decideClaim(null, "100"), { kind: "not_found" });
});

test("decideClaim: first claim binds and grants", () => {
  assert.deepEqual(decideClaim(row({ telegram_user_id: null }), "100"), {
    kind: "grant",
    needsBind: true,
  });
});

test("decideClaim: same user re-claiming grants without re-binding", () => {
  assert.deepEqual(decideClaim(row({ telegram_user_id: "100" }), "100"), {
    kind: "grant",
    needsBind: false,
  });
});

test("decideClaim: a different user cannot steal a claimed token", () => {
  assert.deepEqual(decideClaim(row({ telegram_user_id: "100" }), "999"), { kind: "wrong_user" });
});

test("decideClaim: wrong_user takes priority over inactive status", () => {
  assert.deepEqual(decideClaim(row({ telegram_user_id: "100", status: "canceled" }), "999"), {
    kind: "wrong_user",
  });
});

test("decideClaim: canceled/past_due subscription is denied", () => {
  assert.deepEqual(decideClaim(row({ status: "canceled" }), "100"), { kind: "inactive" });
  assert.deepEqual(decideClaim(row({ status: "past_due" }), "100"), { kind: "inactive" });
});

test("decideAccess: unknown user is not_subscribed", () => {
  assert.deepEqual(decideAccess(null), { kind: "not_subscribed" });
});

test("decideAccess: active subscriber is active", () => {
  assert.deepEqual(decideAccess(row({ telegram_user_id: "100" })), { kind: "active" });
});

test("decideAccess: canceled/past_due subscribers are inactive", () => {
  assert.deepEqual(decideAccess(row({ telegram_user_id: "100", status: "canceled" })), {
    kind: "inactive",
  });
  assert.deepEqual(decideAccess(row({ telegram_user_id: "100", status: "past_due" })), {
    kind: "inactive",
  });
});

test("buildDeepLink builds a t.me start link and tolerates a leading @", () => {
  assert.equal(buildDeepLink("DoubleTrendsBot", "tok_abc"), "https://t.me/DoubleTrendsBot?start=tok_abc");
  assert.equal(buildDeepLink("@DoubleTrendsBot", "tok_abc"), "https://t.me/DoubleTrendsBot?start=tok_abc");
});

test("generateToken is 48 hex chars and unique across calls", () => {
  const a = generateToken();
  const b = generateToken();
  assert.match(a, /^[0-9a-f]{48}$/);
  assert.notEqual(a, b);
});
