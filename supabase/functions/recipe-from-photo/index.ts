// Reads a recipe from photos or screenshots with Claude and returns it as structured data.
// Runs as a Supabase Edge Function so the Anthropic API key never reaches the app.
// Deploy: npx supabase functions deploy recipe-from-photo
// Key:    npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
import Anthropic from 'npm:@anthropic-ai/sdk@^0.131.0';
import { encodeBase64, decodeBase64 } from 'jsr:@std/encoding@1/base64';
import { decode, Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts';

const MODEL = 'claude-opus-5-5';
const MAX_IMAGES = 5;
const MAX_TILES = 16;
// Long screenshots get scaled down so far that the text becomes unreadable; cut them into
// overlapping parts of about this shape instead (width : height).
const TILE_WIDTH = 1200;
const TILE_RATIO = 1.5;
// Parts are never shorter than this: images up to about this size are read without losing detail.
const TILE_MIN_HEIGHT = 1500;
const TILE_OVERLAP = 0.1;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const nullable = (type: string) => ({ anyOf: [{ type }, { type: 'null' }] });

const RECIPE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['found', 'title', 'description', 'servings', 'prepMinutes', 'ingredients', 'instructions', 'tags'],
  properties: {
    found: { type: 'boolean' },
    title: nullable('string'),
    description: nullable('string'),
    servings: nullable('integer'),
    prepMinutes: nullable('integer'),
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'quantity', 'unit'],
        properties: { name: { type: 'string' }, quantity: nullable('number'), unit: nullable('string') },
      },
    },
    instructions: { type: 'array', items: { type: 'string' } },
    tags: { type: 'array', items: { type: 'string' } },
  },
};

const SYSTEM = `Je leest recepten uit foto's en screenshots (van websites, social media, kookboeken of handgeschreven briefjes) voor een Nederlandse gezinsapp met recepten en boodschappenlijstjes.

Neem het recept over zoals het er staat; verzin niets wat niet in de afbeeldingen staat.
- found: false als er geen recept in de afbeeldingen staat; vul de rest dan leeg in.
- title: de naam van het gerecht in gewone schrijfwijze (geen HOOFDLETTERS, geen emoji).
- description: één korte zin over het gerecht in het Nederlands, of null.
- servings: voor hoeveel personen het recept is ("voor 2 pers", "4 persoon"), of null als dat er niet staat.
- prepMinutes: de bereidingstijd in minuten als die er staat, anders null.
- ingredients: precies de hoeveelheden die er staan, voor het aantal personen van het recept (niet omrekenen).
  quantity is een getal (½ = 0.5); unit is de eenheid zoals g, kg, ml, l, el, tl, snuf, blik, teentjes of takjes.
  Bij iets wat je telt (2 eieren, 1 ui) is unit null. Zonder hoeveelheid (peper en zout) zijn quantity en unit null.
  name is het ingrediënt zelf in kleine letters, met wat erbij hoort (bijv. "middelgrote eieren", "zongedroogde tomaten (op waterbasis)").
  Geen keukenspullen (keukenpapier, ovenschaal) en geen kopjes als "Voor de saus".
- instructions: de bereidingsstappen in volgorde, één stap per item, zonder nummering. Neem tips over het serveren alleen op als ze bij de bereiding horen.
- tags: kies 0 tot 3 labels die passen, alleen uit de lijst met bestaande labels die je krijgt. Staat die lijst leeg, geef dan geen labels.

Afbeeldingen die "deel 1 van 3" enzovoort heten, zijn opeenvolgende, overlappende stukken van één lange screenshot: neem wat in de overlap dubbel te zien is maar één keer over.`;

type InputImage = { data: string; mediaType?: string };
type Part = { data: string; mediaType: string; label: string };

/** Cuts long screenshots into readable parts; other images go as they are. */
async function prepare(images: InputImage[]): Promise<Part[]> {
  const parts: Part[] = [];
  for (const [index, input] of images.entries()) {
    const name = images.length > 1 ? `Afbeelding ${index + 1}` : 'Afbeelding';
    const decoded = await decode(decodeBase64(input.data)).catch(() => null);
    if (!(decoded instanceof Image)) {
      parts.push({ data: input.data, mediaType: input.mediaType ?? 'image/jpeg', label: name });
      continue;
    }
    let image = decoded;
    if (image.width > TILE_WIDTH) image = image.resize(TILE_WIDTH, Image.RESIZE_AUTO);
    const tileHeight = Math.max(Math.round(image.width * TILE_RATIO), TILE_MIN_HEIGHT);
    if (image.height <= tileHeight * 1.2) {
      parts.push({ data: encodeBase64(await image.encodeJPEG(85)), mediaType: 'image/jpeg', label: name });
      continue;
    }
    const step = Math.round(tileHeight * (1 - TILE_OVERLAP));
    const count = Math.ceil((image.height - tileHeight) / step) + 1;
    for (let i = 0; i < count; i++) {
      const top = Math.min(i * step, image.height - tileHeight);
      const tile = image.clone().crop(0, top, image.width, tileHeight);
      parts.push({
        data: encodeBase64(await tile.encodeJPEG(85)),
        mediaType: 'image/jpeg',
        label: `${name}, deel ${i + 1} van ${count}`,
      });
    }
  }
  return parts.slice(0, MAX_TILES);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Alleen POST.' }, 405);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'De AI-sleutel is nog niet ingesteld (ANTHROPIC_API_KEY).' }, 500);

  let body: { images?: InputImage[]; knownTags?: string[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Ongeldige aanvraag.' }, 400);
  }
  const images = (body.images ?? []).filter((i) => typeof i?.data === 'string' && i.data.length > 0);
  if (!images.length) return json({ error: 'Geen afbeelding ontvangen.' }, 400);
  if (images.length > MAX_IMAGES) return json({ error: `Kies maximaal ${MAX_IMAGES} afbeeldingen.` }, 400);
  const knownTags = (body.knownTags ?? []).filter((t) => typeof t === 'string').slice(0, 100);

  const parts = await prepare(images);
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const part of parts) {
    content.push({ type: 'text', text: part.label });
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: part.mediaType as 'image/jpeg', data: part.data },
    });
  }
  content.push({
    type: 'text',
    text: `Bestaande labels: ${knownTags.length ? knownTags.join(', ') : '(geen)'}\n\nLees het recept uit de afbeeldingen.`,
  });

  const client = new Anthropic({ apiKey });
  try {
    // `fallbacks: "default"` re-runs the request on another model if a safety classifier
    // wrongly declines it; the SDK types may not know the string form yet.
    const params = {
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: RECIPE_SCHEMA } },
      messages: [{ role: 'user', content }],
    };
    const response = await client.beta.messages.create(params as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming);

    if (response.stop_reason === 'refusal') return json({ error: 'Deze afbeelding kon niet worden gelezen.' }, 422);
    if (response.stop_reason === 'max_tokens') return json({ error: 'Het recept was te lang om in één keer te lezen.' }, 422);
    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') return json({ error: 'Geen antwoord van de AI.' }, 502);
    return json({ recipe: JSON.parse(text.text) });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'Even te druk, probeer het zo nog eens.' }, 429);
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'De AI-sleutel klopt niet.' }, 500);
    if (e instanceof Anthropic.APIError) return json({ error: `De AI gaf een foutmelding (${e.status}).` }, 502);
    return json({ error: (e as Error).message }, 500);
  }
});
