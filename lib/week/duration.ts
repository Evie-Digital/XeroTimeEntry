// lib/week/duration.ts — the duration input parser (ARCHITECTURE §2, §6).
//
// The grid's canonical unit is INTEGER MINUTES (1..59940); the UI accepts a
// handful of shorthand formats and always renders back decimal hours. This is
// the single source of truth for "what does typing `X` into a Cell mean" — the
// Cell parses on commit (Enter) and only POSTs a non-zero result. Slice #10
// piles on more edge-case tests, so the FULL rule is implemented here now.
//
// Accepted formats (all normalise to integer minutes):
//   "1.5"   decimal hours            → 90
//   "1:30"  h:mm                      → 90
//   ":45"   minutes only             → 45
//   "90m"   explicit minutes         → 90
//   "1h30"  h + mm                   → 90
//   "1h"    whole hours              → 60
//   ""      / anything → 0 minutes  → 0   (means "clear the Cell")
//   bare integer: ≥ 16 → MINUTES, < 16 → HOURS   ("90" → 90, "8" → 480)
//   otherwise                        → null (invalid — send nothing)

import { formatHours } from "./dates";

/** Xero's max time-entry duration: 999h in minutes (ARCHITECTURE §2). */
export const MAX_MINUTES = 59_940;

/** Below this, a bare integer is read as HOURS; at/above it, as MINUTES (§6). */
const MINUTE_HEURISTIC = 16;

/**
 * Parse a Cell's raw input into integer minutes.
 * - `""` (or anything evaluating to 0) → `0` — the caller treats 0 as "clear".
 * - a valid non-zero duration → clamped to `1..59940` minutes.
 * - unparseable → `null` — the caller shows an error and sends nothing.
 */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (s === "") return 0;

  let minutes: number | null = null;
  let m: RegExpMatchArray | null;

  if ((m = s.match(/^:(\d+)$/))) {
    // ":45" — minutes only.
    minutes = Number(m[1]);
  } else if ((m = s.match(/^(\d+):(\d{1,2})$/))) {
    // "1:30" — h:mm.
    minutes = Number(m[1]) * 60 + Number(m[2]);
  } else if ((m = s.match(/^(\d+(?:\.\d+)?)m$/))) {
    // "90m" — explicit minutes (decimal tolerated, then rounded).
    minutes = Number(m[1]);
  } else if ((m = s.match(/^(\d+)h(\d+)$/))) {
    // "1h30" — whole hours + minutes.
    minutes = Number(m[1]) * 60 + Number(m[2]);
  } else if ((m = s.match(/^(\d+(?:\.\d+)?)h$/))) {
    // "1h" / "1.5h" — hours (decimal tolerated).
    minutes = Number(m[1]) * 60;
  } else if (/^\d+$/.test(s)) {
    // Bare integer — the ≥16 heuristic (§6).
    const n = Number(s);
    minutes = n >= MINUTE_HEURISTIC ? n : n * 60;
  } else if (/^(?:\d+\.\d*|\.\d+)$/.test(s)) {
    // "1.5" / ".5" — decimal hours.
    minutes = Number(s) * 60;
  } else {
    return null;
  }

  if (minutes === null || Number.isNaN(minutes)) return null;
  minutes = Math.round(minutes);
  if (minutes <= 0) return 0; // "clear"
  return Math.min(minutes, MAX_MINUTES); // clamp to Xero's ceiling
}

/** Integer minutes → decimal-hours display string (reuses `formatHours`). */
export function formatMinutes(minutes: number): string {
  return formatHours(minutes);
}
