const DAY = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();
export function validTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone }).format();
    return true;
  } catch {
    return false;
  }
}
export function wallTime(instant: string | Date, zone: string): string {
  if (!validTimeZone(zone)) throw new Error(`Unknown time zone: ${zone}`);
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(zone, formatter);
  }
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(instant)).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}
export function pseudoUtc(wall: string): number {
  const normalized = wall.length === 10 ? `${wall}T00:00:00` : wall;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(normalized))
    throw new Error("Use an ISO local date or date and time.");
  const result = Date.parse(`${normalized}Z`);
  if (
    !Number.isFinite(result) ||
    new Date(result).toISOString().slice(0, 16) !== normalized.slice(0, 16)
  )
    throw new Error("Invalid date or time.");
  return result;
}
/** Compatible DST disambiguation: earlier instant in a fold, forward across a gap. */
export function wallTimeToUtc(local: string, zone: string): string {
  const wanted = pseudoUtc(local);
  if (!validTimeZone(zone)) throw new Error(`Unknown time zone: ${zone}`);
  const offsets = new Set<number>();
  for (const hours of [-36, -12, 0, 12, 36]) {
    const sample = wanted + hours * 3_600_000;
    offsets.add(pseudoUtc(wallTime(new Date(sample), zone)) - sample);
  }
  const candidates = [...offsets]
    .map((offset) => wanted - offset)
    .sort((a, b) => a - b);
  const exact = candidates.find(
    (candidate) => pseudoUtc(wallTime(new Date(candidate), zone)) === wanted,
  );
  const forward = candidates
    .filter(
      (candidate) => pseudoUtc(wallTime(new Date(candidate), zone)) > wanted,
    )
    .sort(
      (a, b) =>
        pseudoUtc(wallTime(new Date(a), zone)) -
        pseudoUtc(wallTime(new Date(b), zone)),
    )[0];
  if (exact === undefined && forward === undefined)
    throw new Error("This local time cannot be represented.");
  return new Date(exact ?? forward!).toISOString();
}
export function dateInZone(instant: string | Date, zone: string): string {
  return wallTime(instant, zone).slice(0, 10);
}
export function addDays(date: string, count: number): string {
  return new Date(pseudoUtc(date) + count * DAY).toISOString().slice(0, 10);
}
/** All-day reminders use 09:00 in the event's zone; timed events use their instant. */
export function occurrenceReminderTime(
  start: string,
  zone: string,
  minutes: number,
): number {
  const instant =
    start.length === 10 ? wallTimeToUtc(`${start}T09:00:00`, zone) : start;
  return Date.parse(instant) - minutes * 60_000;
}
