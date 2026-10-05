import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import { RecipeImage } from '@/components/RecipeCard';
import { TagInput } from '@/components/TagInput';
import { Button, Field, Loading, Stepper } from '@/components/ui';
import { getRecipe, listRecipes, pickAndUploadImage, saveRecipe } from '@/lib/api';
import { BlockedError, importRecipe, normalizeUrl, type ImportedRecipe } from '@/lib/recipeImport';
import { useSession } from '@/lib/session';
import { colors, radius, spacing } from '@/lib/theme';

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
  const [importMessage, setImportMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    listRecipes()
      .then((all) => setKnownTags([...new Set(all.flatMap((r) => r.tags))].sort((x, y) => x.localeCompare(y, 'nl'))))
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
      .catch((e) => Alert.alert('Laden mislukt', (e as Error).message))
      .finally(() => setLoading(false));
  }, [id, profile?.id]);

  async function pickImage() {
    if (!household) return;
    setUploading(true);
    try {
      const url = await pickAndUploadImage(household.id);
      if (url) setImageUrl(url);
    } catch (e) {
      Alert.alert('Foto uploaden mislukt', (e as Error).message);
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
    setSourceUrl(r.url);

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
    setImporting(true);
    setImportMessage(null);
    try {
      const result = await importRecipe(sourceUrl);
      const hasContent = !!title.trim() || rowsToIngredients(ingredients).length > 0;
      if (hasContent) {
        Alert.alert('Gegevens overnemen?', 'Wat je al hebt ingevuld wordt vervangen door het recept van de website.', [
          { text: 'Annuleren', style: 'cancel' },
          { text: 'Overnemen', onPress: () => applyImport(result) },
        ]);
      } else {
        applyImport(result);
      }
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

  async function save() {
    if (!household || !profile) return;
    const link = sourceUrl.trim() ? normalizeUrl(sourceUrl) : null;
    if (sourceUrl.trim() && !link) {
      Alert.alert('Link klopt niet', 'Controleer de link naar het recept, of maak het veld leeg.');
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
      Alert.alert('Opslaan mislukt', (e as Error).message);
      setSaving(false);
    }
  }

  if (loading) return <Loading />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={80}>
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
          <Text style={styles.label}>Recept van een website?</Text>
          <Text style={styles.linkHint}>Plak de link, dan probeert de app het recept over te nemen.</Text>
          <View style={styles.linkRow}>
            <TextInput
              value={sourceUrl}
              onChangeText={(v) => {
                setSourceUrl(v);
                setImportMessage(null);
              }}
              placeholder="https://www.leukerecepten.nl/..."
              placeholderTextColor={colors.textMuted}
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
    </KeyboardAvoidingView>
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
