import type { Profile } from './types';

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
