import { weekStartOf, weeksBetween, fromISODate } from './dates';
import type { Household, Profile } from './types';

const PALETTE = ['#3E7B5A', '#E8613C', '#3D6FB6', '#8A57B8', '#B8860B', '#C2417A'];

/** A stable color per family member (members are sorted by name, so everyone sees the same colors). */
export function memberColor(memberId: string | null, members: Profile[]): string {
  const index = members.findIndex((m) => m.id === memberId);
  return index === -1 ? '#B9AAA0' : PALETTE[index % PALETTE.length];
}

export function memberInitial(memberId: string | null, members: Profile[]): string {
  return members.find((m) => m.id === memberId)?.display_name.charAt(0).toUpperCase() ?? '?';
}

/** "Jij" for the current user, otherwise the member's name. */
export function memberLabel(memberId: string | null, members: Profile[], meId?: string): string | null {
  if (!memberId) return null;
  if (memberId === meId) return 'Jij';
  return members.find((m) => m.id === memberId)?.display_name ?? null;
}

/** The rotation, leaving out anyone who is no longer in the family. */
function rotationOf(household: Household | null, members: Profile[]): string[] {
  return (household?.chooser_rotation ?? []).filter((id) => members.some((m) => m.id === id));
}

/** Who chooses the week starting at `weekStart` according to the rotation, if there is one. */
export function rotationChooser(household: Household | null, members: Profile[], weekStart: string): string | null {
  const rotation = rotationOf(household, members);
  if (!rotation.length || !household?.rotation_start) return null;
  const weeks = weeksBetween(weekStartOf(fromISODate(household.rotation_start)), weekStart);
  return rotation[((weeks % rotation.length) + rotation.length) % rotation.length];
}

/** The rotation in turn order, starting with whoever chooses this week. */
export function rotationFromThisWeek(household: Household | null, members: Profile[]): string[] {
  const rotation = rotationOf(household, members);
  const first = rotation.indexOf(rotationChooser(household, members, weekStartOf()) ?? '');
  return first <= 0 ? rotation : [...rotation.slice(first), ...rotation.slice(0, first)];
}
