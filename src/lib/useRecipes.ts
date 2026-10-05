import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { listFavoriteIds, listRecipes, setFavorite } from './api';
import { useSession } from './session';
import type { Recipe } from './types';

/** All household recipes plus the current user's favorites, reloaded whenever the screen gains focus. */
export function useRecipes() {
  const { profile } = useSession();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      const [r, f] = await Promise.all([listRecipes(), listFavoriteIds(profile.id)]);
      setRecipes(r);
      setFavorites(f);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const toggleFavorite = useCallback(
    async (recipeId: string) => {
      if (!profile) return;
      const next = !favorites.has(recipeId);
      setFavorites((prev) => {
        const copy = new Set(prev);
        if (next) copy.add(recipeId);
        else copy.delete(recipeId);
        return copy;
      });
      try {
        await setFavorite(profile.id, recipeId, next);
      } catch {
        load();
      }
    },
    [favorites, profile, load],
  );

  return { recipes, favorites, loading, error, reload: load, toggleFavorite };
}
