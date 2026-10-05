// Weekday names, Monday (0) to Sunday (6). A week starts on the household's shopping day,
// so the days of a plan are numbered from that day: use dayName/dayShort for those.
export const WEEKDAY_NAMES = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];
export const WEEKDAY_SHORT = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

/** Local date as YYYY-MM-DD (no timezone shifts). */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Weekday of a date, Monday = 0 ... Sunday = 6. */
export function weekdayOf(d: Date): number {
  return (d.getDay() + 6) % 7;
}

// The weekday the household's weeks start on (its shopping day); set from the household.
let shoppingDay = 0;

export function getShoppingDay(): number {
  return shoppingDay;
}

export function setShoppingDay(day: number) {
  shoppingDay = day;
}

/** First day (the shopping day) of the week containing `d`. */
export function weekStartOf(d: Date = new Date()): string {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  copy.setDate(copy.getDate() - ((weekdayOf(copy) - shoppingDay + 7) % 7));
  return toISODate(copy);
}

export function addWeeks(weekStart: string, weeks: number): string {
  const d = fromISODate(weekStart);
  d.setDate(d.getDate() + weeks * 7);
  return toISODate(d);
}

export function dateOfDay(weekStart: string, day: number): Date {
  const d = fromISODate(weekStart);
  d.setDate(d.getDate() + day);
  return d;
}

/** Name of a day of the plan, e.g. "Dinsdag" when the week starts on Tuesday and day is 0. */
export function dayName(weekStart: string, day: number): string {
  return WEEKDAY_NAMES[weekdayOf(dateOfDay(weekStart, day))];
}

export function dayShort(weekStart: string, day: number): string {
  return WEEKDAY_SHORT[weekdayOf(dateOfDay(weekStart, day))];
}

export function formatShort(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function weekLabel(weekStart: string): string {
  const current = weekStartOf();
  if (weekStart === current) return 'Deze week';
  if (weekStart === addWeeks(current, 1)) return 'Volgende week';
  if (weekStart === addWeeks(current, -1)) return 'Vorige week';
  return `Week van ${formatShort(fromISODate(weekStart))}`;
}

export function weekRange(weekStart: string): string {
  return `${formatShort(dateOfDay(weekStart, 0))} – ${formatShort(dateOfDay(weekStart, 6))}`;
}

/** Index 0..6 of today within its week. */
export function todayIndex(): number {
  return (weekdayOf(new Date()) - shoppingDay + 7) % 7;
}

/** Whole weeks from one week start to another (negative when `to` is earlier). */
export function weeksBetween(from: string, to: string): number {
  return Math.round((fromISODate(to).getTime() - fromISODate(from).getTime()) / (7 * 24 * 60 * 60 * 1000));
}
