import * as ImagePicker from 'expo-image-picker';

import type { ImportedRecipe } from './recipeImport';
import { isDemo, supabase } from './supabase';
import type { Ingredient } from './types';

const MAX_IMAGES = 5;

type PhotoRecipe = {
  found: boolean;
  title: string | null;
  description: string | null;
  servings: number | null;
  prepMinutes: number | null;
  ingredients: { name: string; quantity: number | null; unit: string | null }[];
  instructions: string[];
  tags: string[];
};

/**
 * Lets the user pick one or more photos or screenshots of a recipe and has AI read them
 * (the Supabase function recipe-from-photo). Returns null when nothing was picked.
 */
export async function recipeFromPhotos(knownTags: string[]): Promise<ImportedRecipe | null> {
  if (isDemo) throw new Error('Recepten uit een foto lezen werkt niet in de demomodus.');

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: MAX_IMAGES,
    orderedSelection: true,
    quality: 0.8,
    base64: true,
  });
  if (result.canceled || !result.assets.length) return null;

  const images = result.assets.slice(0, MAX_IMAGES).map((asset) => {
    // On the web the picked image can come back as a data: URL instead of base64.
    const data = asset.base64 ?? asset.uri.match(/^data:[^;]+;base64,(.*)$/)?.[1];
    if (!data) throw new Error('De foto kon niet worden gelezen.');
    return { data, mediaType: asset.base64 ? 'image/jpeg' : (asset.mimeType ?? 'image/jpeg') };
  });

  const { data, error } = await supabase.functions.invoke('recipe-from-photo', {
    body: { images, knownTags },
  });
  if (error) {
    // The function explains what went wrong in its response.
    const message = await (error as { context?: Response }).context
      ?.json()
      .then((b: { error?: string }) => b.error)
      .catch(() => null);
    throw new Error(message ?? 'De foto kon niet worden gelezen.');
  }

  const recipe = (data as { recipe: PhotoRecipe }).recipe;
  if (!recipe.found) throw new Error('Ik zie geen recept op deze foto.');
  return {
    url: '',
    title: recipe.title,
    description: recipe.description,
    imageUrl: null,
    servings: recipe.servings,
    prepMinutes: recipe.prepMinutes,
    ingredients: recipe.ingredients.map(
      (i): Ingredient => ({ name: i.name, quantity: i.quantity, unit: i.unit?.trim() || null }),
    ),
    instructions: recipe.instructions.length ? recipe.instructions.join('\n') : null,
    tags: recipe.tags.filter((t) => knownTags.includes(t)),
  };
}
