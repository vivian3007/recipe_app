import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  IngredientEditor,
  newRow,
  rowsFromIngredients,
  rowsToIngredients,
  type IngredientRow,
} from '@/components/IngredientEditor';
import { KeyboardScreen } from '@/components/KeyboardScreen';
import { RecipeImage } from '@/components/RecipeCard';
import { TagInput } from '@/components/TagInput';
import { Button, Field, Loading, Stepper } from '@/components/ui';
import { getRecipe, listRecipes, pickAndUploadImage, saveRecipe } from '@/lib/api';
import { confirm, notify } from '@/lib/dialogs';
import { BlockedError, importRecipe, normalizeUrl, type ImportedRecipe } from '@/lib/recipeImport';
import { parseRecipeText } from '@/lib/recipeText';
import { useSession } from '@/lib/session';
import { tagsByUse } from '@/lib/tags';
import { colors, radius, spacing } from '@/lib/theme';
import { useConfirmLeave } from '@/lib/useConfirmLeave';

export default function EditRecipe() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { profile, household } = useSession();
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [servings, setServings] = useState(4);
  const [prepMinutes, setPrepMinutes] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [knownTags, setKnownTags] = useState<string[]>([]);
  const [instructions, setInstructions] = useState('');
  const [ingredients, setIngredients] = useState<IngredientRow[]>([newRow(), newRow(), newRow()]);
  const [otherAuthor, setOtherAuthor] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [importMessage, setImportMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Snapshot of everything that gets saved, to tell whether something changed since opening.
  const snapshot = useMemo(
    () =>
      JSON.stringify([
        title.trim(),
        description.trim(),
        imageUrl,
        servings,
        prepMinutes,
        tags,
        instructions.trim(),
        sourceUrl.trim(),
        rowsToIngredients(ingredients),
      ]),
    [title, description, imageUrl, servings, prepMinutes, tags, instructions, sourceUrl, ingredients],
  );
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);
  if (!loading && initialSnapshot === null) setInitialSnapshot(snapshot);
  useConfirmLeave(initialSnapshot !== null && snapshot !== initialSnapshot && !saving);

  useEffect(() => {
    listRecipes()
      // Most used labels first, so the ones the family actually uses are on top.
      .then((all) => setKnownTags(tagsByUse(all).map((t) => t.tag)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) return;
    getRecipe(id)
      .then((r) => {
        setTitle(r.title);
        setDescription(r.description ?? '');
        setImageUrl(r.image_url);
        setServings(r.servings);
        setPrepMinutes(r.prep_minutes != null ? String(r.prep_minutes) : '');
        setTags(r.tags);
        setInstructions(r.instructions ?? '');
        setSourceUrl(r.source_url ?? '');
        setIngredients(rowsFromIngredients(r.recipe_ingredients));
        if (r.created_by !== profile?.id) setOtherAuthor(r.author?.display_name ?? 'iemand anders');
      })
      .catch((e) => notify('Laden mislukt', (e as Error).message))
      .finally(() => setLoading(false));
  }, [id, profile?.id]);

  async function pickImage() {
    if (!household) return;
    setUploading(true);
    try {
      const url = await pickAndUploadImage(household.id);
      if (url) setImageUrl(url);
    } catch (e) {
      notify('Foto uploaden mislukt', (e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function applyImport(r: ImportedRecipe) {
    if (r.title) setTitle(r.title);
    if (r.description) setDescription(r.description);
    if (r.imageUrl) setImageUrl(r.imageUrl);
    if (r.servings) setServings(Math.min(30, r.servings));
    if (r.prepMinutes) setPrepMinutes(String(r.prepMinutes));
    if (r.tags.length) setTags((prev) => [...new Set([...prev, ...r.tags])]);
    if (r.instructions) setInstructions(r.instructions);
    if (r.ingredients.length) setIngredients(rowsFromIngredients(r.ingredients));
    if (r.url) setSourceUrl(r.url);

    if (r.ingredients.length) {
      const steps = r.instructions ? r.instructions.split('\n').length : 0;
      setImportMessage({
        ok: true,
        text: `Gevonden: ${r.ingredients.length} ingrediënten${steps ? ` en ${steps} stappen` : ''}. Kijk even of alles klopt en haal weg wat geen ingrediënt is (zoals een ovenschaal).`,
      });
    } else {
      setImportMessage({
        ok: false,
        text: `Ik kon ${r.title ? 'alleen de titel' : 'het recept niet'} automatisch overnemen. Vul de rest zelf in, of bewaar alleen de link: dan kan iedereen de bereiding op de website lezen.`,
      });
    }
  }

  async function fetchFromLink() {
    // Browsers don't allow reading other websites, so this only works in the installed app.
    if (Platform.OS === 'web') {
      setImportMessage({
        ok: false,
        text: 'Automatisch ophalen werkt alleen in de Android-app. Vul het recept zelf in; de link wordt bewaard, zodat iedereen het origineel kan bekijken.',
      });
      return;
    }
    setImporting(true);
    setImportMessage(null);
    try {
      const result = await importRecipe(sourceUrl);
      const hasContent = !!title.trim() || rowsToIngredients(ingredients).length > 0;
      const replace =
        !hasContent ||
        (await confirm(
          'Gegevens overnemen?',
          'Wat je al hebt ingevuld wordt vervangen door het recept van de website.',
          'Overnemen',
        ));
      if (replace) applyImport(result);
    } catch (e) {
      setImportMessage({
        ok: false,
        text:
          e instanceof BlockedError
            ? 'Deze website (zoals Allerhande) staat automatisch ophalen niet toe. Vul het recept zelf in; de link wordt bewaard, zodat iedereen het origineel op de website kan bekijken.'
          : `${(e as Error).message === 'Dit lijkt geen geldige link.' ? 'Dit lijkt geen geldige link.' : 'De website kon niet worden gelezen.'} De link wordt wel bewaard als je het recept opslaat, zodat iedereen de bereiding op de website kan lezen.`,
      });
    } finally {
      setImporting(false);
    }
  }

  /** Fills in the recipe from pasted text, e.g. copied from a screenshot. */
  async function fillFromText() {
    const result = parseRecipeText(pastedText);
    if (!result.ingredients.length && !result.instructions) {
      setImportMessage({
        ok: false,
        text: 'Ik herken hier geen recept in. Staan de ingrediënten en de bereiding er allebei in? Je kunt het recept ook zelf invullen.',
      });
      return;
    }
    const hasContent = !!title.trim() || rowsToIngredients(ingredients).length > 0;
    const replace =
      !hasContent ||
      (await confirm(
        'Gegevens overnemen?',
        'Wat je al hebt ingevuld wordt vervangen door het geplakte recept.',
        'Overnemen',
      ));
    if (!replace) return;
    applyImport(result);
    setPasteOpen(false);
    setPastedText('');
  }

  async function save() {
    if (!household || !profile) return;
    const link = sourceUrl.trim() ? normalizeUrl(sourceUrl) : null;
    if (sourceUrl.trim() && !link) {
      notify('Link klopt niet', 'Controleer de link naar het recept, of maak het veld leeg.');
      return;
    }
    setSaving(true);
    try {
      const savedId = await saveRecipe(
        {
          title: title.trim(),
          description: description.trim() || null,
          image_url: imageUrl,
          servings,
          prep_minutes: prepMinutes ? Number.parseInt(prepMinutes, 10) || null : null,
          instructions: instructions.trim() || null,
          source_url: link,
          tags,
          ingredients: rowsToIngredients(ingredients),
        },
        { householdId: household.id, userId: profile.id },
        id,
      );
      if (id) router.back();
      else router.replace({ pathname: '/recipe/[id]', params: { id: savedId } });
    } catch (e) {
      notify('Opslaan mislukt', (e as Error).message);
      setSaving(false);
    }
  }

  if (loading) return <Loading />;

  return (
    <KeyboardScreen>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {otherAuthor && (
          <View style={styles.warning}>
            <Ionicons name="people-outline" size={20} color={colors.primaryDark} />
            <Text style={styles.warningText}>
              Dit is het recept van {otherAuthor}. Wat je hier verandert, geldt voor het hele gezin. Alleen voor één avond
              iets anders? Gebruik dan <Text style={{ fontWeight: '700' }}>Aanpassen</Text> bij het gerecht in het weekplan.
            </Text>
          </View>
        )}
        <View style={styles.linkBox}>
          <Text style={styles.label}>Recept van een website of screenshot?</Text>
          <Text style={styles.linkHint}>Plak de link, dan probeert de app het recept over te nemen.</Text>
          <View style={styles.linkRow}>
            <TextInput
              value={sourceUrl}
              onChangeText={(v) => {
                setSourceUrl(v);
                setImportMessage(null);
              }}
              placeholder="https://www.leukerecepten.nl/..."
              placeholderTextColor={colors.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={styles.linkInput}
            />
            <Pressable
              onPress={fetchFromLink}
              disabled={!sourceUrl.trim() || importing}
              style={({ pressed }) => [styles.fetchButton, (!sourceUrl.trim() || importing || pressed) && { opacity: 0.5 }]}
            >
              {importing ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="download-outline" size={18} color="#fff" />
              )}
              <Text style={styles.fetchText}>Ophalen</Text>
            </Pressable>
          </View>
          {pasteOpen ? (
            <View style={{ gap: spacing(2) }}>
              <Text style={styles.linkHint}>
                Kopieer de tekst uit een screenshot. Op de iPhone houd je je vinger op de tekst in de foto en kies je
                Kopieer; op Android tik je op Tekst selecteren of gebruik je Google Lens. Plak hem hieronder.
              </Text>
              <TextInput
                value={pastedText}
                onChangeText={(v) => {
                  setPastedText(v);
                  setImportMessage(null);
                }}
                placeholder={'Ingrediënten voor 2 pers:\n140 gram pasta\n…\n\nBereiding:\n1. Kook de pasta…'}
                placeholderTextColor={colors.placeholder}
                multiline
                style={[styles.linkInput, styles.pasteInput]}
              />
              <View style={styles.linkRow}>
                <Button
                  title="Annuleren"
                  variant="ghost"
                  onPress={() => {
                    setPasteOpen(false);
                    setPastedText('');
                  }}
                  style={{ flex: 1 }}
                />
                <Button title="Invullen" icon="checkmark" onPress={fillFromText} disabled={!pastedText.trim()} style={{ flex: 1 }} />
              </View>
            </View>
          ) : (
            <Pressable
              onPress={() => {
                setPasteOpen(true);
                setImportMessage(null);
              }}
              style={({ pressed }) => [styles.pasteButton, pressed && { opacity: 0.6 }]}
            >
              <Ionicons name="clipboard-outline" size={18} color={colors.accent} />
              <Text style={styles.pasteText}>Recepttekst plakken</Text>
            </Pressable>
          )}
          {importMessage && (
            <Text style={[styles.importMessage, { color: importMessage.ok ? colors.accent : colors.primaryDark }]}>
              {importMessage.text}
            </Text>
          )}
        </View>

        <Pressable onPress={pickImage} style={styles.imagePicker}>
          <RecipeImage uri={imageUrl} height={180} />
          <View style={styles.imageBadge}>
            <Ionicons name="camera" size={16} color="#fff" />
            <Text style={styles.imageBadgeText}>{uploading ? 'Uploaden…' : imageUrl ? 'Andere foto' : 'Foto toevoegen'}</Text>
          </View>
        </Pressable>

        <Field label="Naam van het gerecht" value={title} onChangeText={setTitle} placeholder="Bijv. Lasagne van oma" />
        <Field
          label="Korte omschrijving"
          value={description}
          onChangeText={setDescription}
          placeholder="Waarom is dit zo lekker?"
          multiline
          style={{ minHeight: 64 }}
        />

        <View style={styles.row}>
          <View style={{ flex: 1, gap: spacing(1.5) }}>
            <Text style={styles.label}>Recept is voor</Text>
            <Stepper value={servings} onChange={setServings} suffix="pers." />
          </View>
          <View style={{ width: 120 }}>
            <Field label="Tijd (min)" value={prepMinutes} onChangeText={setPrepMinutes} keyboardType="number-pad" placeholder="30" />
          </View>
        </View>

        <TagInput tags={tags} onChange={setTags} suggestions={knownTags} />

        <Text style={styles.label}>Ingrediënten</Text>
        <Text style={styles.hint}>Vul de hoeveelheid in voor {servings} personen, dan rekent de app het om.</Text>
        <IngredientEditor rows={ingredients} onChange={setIngredients} />

        <Field
          label="Bereiding"
          value={instructions}
          onChangeText={setInstructions}
          placeholder={'Elke stap op een nieuwe regel.\nBijv. Bak het gehakt rul.'}
          multiline
          style={{ minHeight: 140, textAlignVertical: 'top' }}
        />

        <Button title={id ? 'Wijzigingen opslaan' : 'Recept opslaan'} icon="checkmark" onPress={save} loading={saving} disabled={!title.trim() || uploading} />
      </ScrollView>
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing(5), gap: spacing(4), paddingBottom: spacing(16) },
  linkBox: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.lg,
    padding: spacing(4),
    gap: spacing(2),
  },
  linkHint: { fontSize: 13, color: colors.textMuted },
  pasteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing(2),
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing(3),
  },
  pasteText: { fontSize: 15, fontWeight: '600', color: colors.accent },
  pasteInput: { minHeight: 160, maxHeight: 320, textAlignVertical: 'top' },
  linkRow: { flexDirection: 'row', gap: spacing(2) },
  linkInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(3),
    fontSize: 15,
    color: colors.text,
  },
  fetchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1.5),
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: spacing(3.5),
  },
  fetchText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  importMessage: { fontSize: 13, lineHeight: 19, fontWeight: '600' },
  warning: {
    flexDirection: 'row',
    gap: spacing(3),
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    padding: spacing(4),
  },
  warningText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.text },
  imagePicker: { borderRadius: radius.md, overflow: 'hidden' },
  imageBadge: {
    position: 'absolute',
    bottom: spacing(3),
    right: spacing(3),
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1.5),
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.5),
    borderRadius: radius.pill,
  },
  imageBadgeText: { color: '#fff', fontWeight: '600' },
  row: { flexDirection: 'row', gap: spacing(4), alignItems: 'flex-end' },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  hint: { fontSize: 13, color: colors.textMuted, marginTop: -spacing(2) },
});
