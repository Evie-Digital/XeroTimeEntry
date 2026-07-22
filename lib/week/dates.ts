// lib/week/dates.ts — pure calendar-date helpers (ARCHITECTURE §2).
//
// The whole domain keys off pure dates ("YYYY-MM-DD"), NEVER wall-clock
// instants — a week is just seven calendar dates and an Entry buckets into the
// Slot whose date equals the VERBATIM date portion of its `dateUtc`. All math
// here uses UTC accessors so results never drift with the host machine's
// timezone. Later slices reuse these (write `dateUtc`, week navigation).

/**
 * The verbatim date portion of a Xero `dateUtc` ISO string — the first 10
 * chars, taken as-is. NO timezone conversion (that would risk an off-by-one).
 * `"2026-07-20T09:30:00Z"` → `"2026-07-20"`.
 */
export function datePortion(dateUtc: string): string {
  return dateUtc.slice(0, 10);
}

/**
 * The seven dates (Mon–Sun) of the week containing `anchor` (any date in that
 * week, or a full ISO string — only its date portion is used). Returned as
 * pure "YYYY-MM-DD" strings.
 */
export function weekDates(anchor: string): string[] {
  const start = new Date(`${datePortion(anchor)}T00:00:00Z`);
  const dow = start.getUTCDay(); // 0=Sun … 6=Sat
  const sinceMonday = (dow + 6) % 7; // Mon=0 … Sun=6
  const monday = new Date(start);
  monday.setUTCDate(start.getUTCDate() - sinceMonday);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setUTCDate(monday.getUTCDate() + i);
    return day.toISOString().slice(0, 10);
  });
}

/** Today's LOCAL calendar date as "YYYY-MM-DD" (what "today" means in the grid). */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Short column label for a date, e.g. "Mon 20". Uses UTC accessors (pure date). */
export function dayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
    d.getUTCDay()
  ];
  return `${weekday} ${d.getUTCDate()}`;
}

/**
 * A Slot's pure calendar date → the Xero `dateUtc` write value: midnight UTC of
 * that same date (ARCHITECTURE §2 — write `<localDate>T00:00:00Z`, read buckets
 * off the verbatim date substring, so writes and reads never drift). Any full
 * ISO string is accepted (only its date portion is used).
 * `"2026-07-20"` → `"2026-07-20T00:00:00Z"`.
 */
export function slotDateUtc(date: string): string {
  return `${datePortion(date)}T00:00:00Z`;
}

/** Integer minutes → decimal-hours display string. 90 → "1.5", 480 → "8", 0 → "0". */
export function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return String(Math.round(hours * 100) / 100);
}
