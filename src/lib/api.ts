import * as demo from './api.demo';
import * as remote from './api.remote';
import { isDemo } from './supabase';

// Screens import from here; the demo implementation must match the Supabase one exactly.
const impl: typeof remote = isDemo ? demo : remote;

export const {
  updateDisplayName,
  listRecipes,
  getRecipe,
  saveRecipe,
  deleteRecipe,
  pickAndUploadImage,
  listFavoriteIds,
  setFavorite,
  getWeekPlan,
  setMeal,
  setDayChoosers,
  moveMeal,
  updateMealAdjustments,
  updateMealServings,
  removeMeal,
  listShoppingChecks,
  setShoppingCheck,
} = impl;
