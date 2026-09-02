/**
 * Formats a value as a number rounded to 1 decimal place,
 * dropping a trailing ".0" (e.g. 12.0 -> "12", 12.34 -> "12.3").
 * Non-numeric / non-finite values render as "0".
 */
export function fmt1(v: unknown): string {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "0";
  const s = (Math.round(n * 10) / 10).toString();
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}
