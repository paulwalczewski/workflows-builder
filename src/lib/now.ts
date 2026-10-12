/** Reads a simulated "now" from a query value; null when absent or invalid. */
export function parseNow(value: string | string[] | undefined): Date | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const time = Date.parse(raw);
  return Number.isNaN(time) ? null : new Date(time);
}
