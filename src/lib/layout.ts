import type { ViewStyle } from 'react-native';

// Screen widths where the app changes: small phones, and from there on tablets and computers.
export const SMALL_PHONE = 360;
export const COMPACT = 400;
export const WIDE = 720;

/** Keeps a page at a comfortable width and in the middle on tablets and computers. */
export const pageWidth: ViewStyle = { width: '100%', maxWidth: WIDE, alignSelf: 'center' };

const GRID_MAX_WIDTH = 1200;

/** The recipe grid can use more of the screen, because its cards are small. */
export const gridWidth: ViewStyle = { width: '100%', maxWidth: GRID_MAX_WIDTH, alignSelf: 'center' };

const GRID_PADDING = 32;
const GRID_GAP = 12;
const CARD_MIN = 165;
const MAX_COLUMNS = 5;

/** As many recipe cards next to each other as fit at a comfortable size: at least two, at most five. */
export function recipeColumns(width: number) {
  const room = Math.min(width, GRID_MAX_WIDTH) - GRID_PADDING;
  return Math.min(MAX_COLUMNS, Math.max(2, Math.floor((room + GRID_GAP) / (CARD_MIN + GRID_GAP))));
}

/** Wider cards get a higher photo, so it doesn't turn into a strip. */
export function recipeImageHeight(width: number, columns: number) {
  const card = (Math.min(width, GRID_MAX_WIDTH) - GRID_PADDING - GRID_GAP * (columns - 1)) / columns;
  return Math.round(Math.max(120, card * 0.62));
}
