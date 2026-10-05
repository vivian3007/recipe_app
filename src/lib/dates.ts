export const DAY_NAMES = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];
export const DAY_SHORT = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
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

/** Monday of the week containing `d`. */
export function weekStartOf(d: Date = new Date()): string {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const offset = (copy.getDay() + 6) % 7; // Monday = 0
  copy.setDate(copy.getDate() - offset);
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
  return (new Date().getDay() + 6) % 7;
}
