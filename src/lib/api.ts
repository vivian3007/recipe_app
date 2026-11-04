import * as demo from './api.demo';
import * as remote from './api.firebase';
import { isDemo } from './backend';

// Screens import from here; the demo implementation must match the Firebase one exactly.
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
  saveAisleSetup,
  saveStaples,
  setStapleSkipped,
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
  setShoppingExtraQuantity,
} = impl;
