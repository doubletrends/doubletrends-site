/**
 * Pure formatting for the /brief Telegram reply — no I/O, no DB, no Telegram.
 * Edit TIER_META, formatBriefMessage, or NO_BRIEF_MESSAGE to change wording.
 * The wire format (BriefPayload / brief_snapshot table) lives in index.ts and
 * is unrelated to display.
 */

export interface BriefSnapshot {
  ticker: string;
  display_name: string;
  as_of_date: string;
  close_value: number;
  mdd_value: number;
  tier: string;
  updated_at: string;
}

interface TierMeta {
  emoji: string;
  label: string;
  description: string;
}

export const TIER_META: Record<string, TierMeta> = {
  daily_noise: {
    emoji: "🟢",
    label: "Daily Noise",
    description:
      "The index sits in the upper half of its recent 2-year history. Our framework doesn't flag stress at this level — this is the everyday state where signals rarely fire.",
  },
  common_correction: {
    emoji: "🟡",
    label: "Common Correction",
    description:
      "The index is below its typical recent range. Pullbacks of this depth occur multiple times per year and usually resolve quickly. The framework is watching but hasn't escalated.",
  },
  bear_market: {
    emoji: "🟠",
    label: "Bear Market",
    description:
      "The index has dropped well below its recent range. The framework treats this as elevated market stress — the environment where the DoubleTrends™ signal historically fires.",
  },
  crash: {
    emoji: "🔴",
    label: "Crash",
    description:
      "The index is at the extreme end of its recent history. The framework treats this as deep capitulation — the rare, high-stakes environment the signal is designed to catch.",
  },
};

const UNKNOWN_TIER: TierMeta = {
  emoji: "⚪",
  label: "Unknown",
  description: "Tier classification unavailable.",
};

export const NO_BRIEF_MESSAGE =
  "No market brief available yet. Please try /brief again shortly.";

export function formatBriefMessage(snapshot: BriefSnapshot): string {
  const meta = TIER_META[snapshot.tier] ?? UNKNOWN_TIER;
  // Floor (not round) so a value just under a threshold never displays as the
  // tier above — keeps the score number consistent with the tier label.
  const mddDisplay = Math.floor(snapshot.mdd_value);
  return [
    `📊 DoubleTrends™ Market Brief`,
    `${snapshot.display_name} (${snapshot.ticker}) · ${snapshot.as_of_date} close ${snapshot.close_value.toFixed(2)}`,
    ``,
    `${meta.emoji} ${meta.label}`,
    ``,
    meta.description,
    ``,
    `────────────`,
    `MDD score: ${mddDisplay} / 100  (lower = closer to highs)`,
    `Refreshed ${snapshot.updated_at}`,
    ``,
    `Educational information only — not financial advice.`,
  ].join("\n");
}
