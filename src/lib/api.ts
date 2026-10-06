import * as demo from './api.demo';
import * as remote from './api.remote';
import { isDemo } from './supabase';

// Screens import from here; the demo implementation must match the Supabase one exactly.
const impl: typeof remote = isDemo ? demo : remote;

export const {
  updateDisplayName,
  listRecipes,
  getRecipe,
  replaceTagsEverywhere,
  saveRecipe,
  deleteRecipe,
  pickAndUploadImage,
  listFavoriteIds,
  setFavorite,
  getWeekPlan,
  addMeal,
  replaceMeal,
  addOwnDish,
  updateOwnDish,
  saveAvgOptions,
  listAvgDishes,
  saveNotificationSettings,
  saveAisleOverrides,
  markWeekReady,
  unmarkWeekReady,
  setDayChoosers,
  resetDayChoosers,
  saveChooserRotation,
  setShoppingDay,
  swapDays,
  updateMealAdjustments,
  updateMealServings,
  removeMeal,
  listShoppingChecks,
  setShoppingCheck,
  listShoppingExtras,
  addShoppingExtra,
  removeShoppingExtra,
} = impl;
