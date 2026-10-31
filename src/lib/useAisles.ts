import { useState } from 'react';
import { LayoutAnimation } from 'react-native';

import { familyAisles, withNewAisle, type AisleSetup } from '@/lib/aisles';
import { saveAisleOverrides, saveAisleSetup } from '@/lib/api';
import { notify } from '@/lib/dialogs';
import { useSession } from '@/lib/session';

/**
 * The family's aisles and which product goes where, with the changes to them. Changes show
 * straight away, also while saving, and count for the whole family and every week.
 */
export function useAisles() {
  const { household, refresh } = useSession();
  const [overridesDraft, setOverridesDraft] = useState<Record<string, string> | null>(null);
  const [setupDraft, setSetupDraft] = useState<AisleSetup | null>(null);
  const overrides = overridesDraft ?? household?.aisle_overrides ?? {};
  const setup = setupDraft ?? household?.aisle_setup ?? {};
  const aisles = familyAisles(setup);

  /** Puts a product in another aisle; null: back to the guess. */
  async function moveTo(productName: string, key: string | null) {
    if (!household) return;
    const name = productName.trim().toLowerCase();
    const next = { ...overrides };
    if (key) next[name] = key;
    else delete next[name];
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOverridesDraft(next);
    try {
      await saveAisleOverrides(household.id, next);
      await refresh();
    } catch (e) {
      notify('Verplaatsen mislukt', (e as Error).message);
    } finally {
      setOverridesDraft(null);
    }
  }

  /** Saves the family's aisles: order, names and their own aisles. */
  async function saveSetup(next: AisleSetup) {
    if (!household) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSetupDraft(next);
    try {
      await saveAisleSetup(household.id, next);
      await refresh();
    } catch (e) {
      notify('Paden opslaan mislukt', (e as Error).message);
    } finally {
      setSetupDraft(null);
    }
  }

  /** Makes a new aisle and puts the product in it. */
  async function moveToNewAisle(productName: string, label: string) {
    const added = withNewAisle(setup, aisles, label);
    await saveSetup(added.setup);
    await moveTo(productName, added.key);
  }

  return { aisles, setup, overrides, moveTo, saveSetup, moveToNewAisle };
}
