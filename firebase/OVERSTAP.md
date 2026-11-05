# Overstap van Supabase naar Firebase

Draaiboek voor één keer. Alles blijft gratis: Firebase op het Spark-plan (geen betaalrekening koppelen), Cloudinary en Cloudflare Workers op hun gratis plan.

**Belangrijk:** zonder de `EXPO_PUBLIC_FIREBASE_*`-variabelen start de app in demomodus. Publiceer deze code dus pas in stap 4, nadat de variabelen in stap 1 staan.

## 1. Voorbereiden

1. **Firebase** (project `weekmenu-806d1` bestaat al voor Android-push; laat het op Spark staan):
   - Authentication: zet **E-mail/wachtwoord** aan.
   - Firestore: maak de database aan in een Europese locatie. Die keuze is definitief.
   - Projectinstellingen: voeg een web-app toe voor de `EXPO_PUBLIC_FIREBASE_*`-waarden.
   - Serviceaccounts: maak een sleutel en bewaar die **buiten deze map**.
2. **Regels online:** `cd firebase`, `npx firebase login`, dan `npx firebase deploy --only firestore:rules --project weekmenu-806d1`.
3. **Cloudinary:** gratis account; noteer cloud name, API key en API secret.
4. **Cloudflare:** gratis account. Dan in `workers/notify`: `npm install`, `npx wrangler secret put <NAAM>` voor elk geheim uit `wrangler.toml`, en `npx wrangler deploy`. Gebruik **dezelfde VAPID-sleutels** als nu, anders werken bestaande meldingen op de iPhone niet meer. De planning loopt dan al, maar er staan nog geen gezinnen in Firestore.
5. **Variabelen:** zet de waarden uit `.env.example` in `.env.local` en in de EAS-omgeving `preview` (met `npx eas-cli@latest env:create`).
6. **Geheimenbestand** buiten de repo, bijvoorbeeld `../weekmenu-migration/env`:
   ```
   SUPABASE_DB_URL=<directe databaseverbinding uit Supabase>
   SUPABASE_URL=https://<project>.supabase.co
   GOOGLE_APPLICATION_CREDENTIALS=<pad naar de serviceaccount-sleutel>
   CLOUDINARY_CLOUD_NAME=
   CLOUDINARY_API_KEY=
   CLOUDINARY_API_SECRET=
   ```

## 2. Proefmigratie op een apart testproject

1. Maak een tweede, leeg Firebase-project (Spark), met e-mail/wachtwoord en Firestore aan, en de regels erop.
2. In `scripts/migrate`, met de sleutel van dát project:
   ```
   npm install
   node --env-file=../../../weekmenu-migration/env migrate.mjs --project <testproject>
   ```
3. Het rapport moet eindigen met **Alles klopt.** Draai het een tweede keer: dat moet hetzelfde geven.
4. Bouw de app tegen het testproject en controleer:
   - **Inloggen met je eigen, bestaande wachtwoord.** Lukt dat niet, dan moet iedereen eenmalig een nieuw wachtwoord kiezen; de data blijft gewoon behouden.
   - Recepten met foto's, weekplan, boodschappen.
   - Op een Android-telefoon en iPhone: foto toevoegen, gezin joinen, vliegtuigstand.
   - De tellers in de Firebase-console: het gebruik per dag moet ruim onder 50.000 reads blijven.

## 3. Back-up (het Free-plan van Supabase maakt er zelf geen)

```
npx supabase db dump --db-url "<directe verbinding>" -f ../weekmenu-migration/schema.sql
npx supabase db dump --db-url "<directe verbinding>" --data-only -f ../weekmenu-migration/data.sql
```
Download ook de map `recipe-images` uit Supabase Storage. Bewaar dit veilig en **nooit in de repo**: het bevat wachtwoord-hashes.

## 4. De overstap (op een rustig moment, zeg het gezin vooraf)

1. Laat iedereen de app even met internet openen, zodat wachtende vinkjes verstuurd zijn.
2. Zet in Supabase de herinneringen uit en de database op alleen-lezen (SQL Editor):
   ```sql
   select cron.unschedule('weekmenu-reminders');
   alter database postgres set default_transaction_read_only = on;
   ```
   Open daarna een nieuwe SQL-tab en test of `update public.households set name = name` nu een fout geeft. Oude app-versies krijgen zo een foutmelding in plaats van dat wijzigingen ongemerkt verdwijnen.
3. Definitieve migratie naar productie:
   ```
   node --env-file=../../../weekmenu-migration/env migrate.mjs --project weekmenu-806d1
   ```
   Alleen bij **Alles klopt.** verder. Zo niet: stap 6.
4. Controleer dat de runtime nog klopt; dit moet de waarde van de geïnstalleerde APK zijn (`2f85ff5b…`):
   ```
   npx expo-updates runtimeversion:resolve --platform android
   ```
5. Publiceer:
   ```
   npx expo export --platform web --clear
   npx eas-cli@latest deploy --prod
   npx eas-cli@latest update --channel family --environment preview --platform android --message "Over op Firebase"
   ```
   Exporteer altijd naar de standaardmap `dist`, zonder `--output-dir` naar een map buiten het project: dan ontbreken de iconen en `manifest.json`, en wordt het app-icoon op de iPhone zwart. Controleer daarna dat `/apple-touch-icon.png` op de site als `image/png` terugkomt; dat kan een minuut duren.
6. **Iedereen logt één keer opnieuw in** met het eigen wachtwoord.

## 5. Daarna

- Controleer de eerste dagen of de herinneringen aankomen (Cloudflare → Workers → Logs).
- Houd Supabase minstens een maand beschikbaar. Een Free-project pauzeert na 7 dagen en is daarna 90 dagen te herstellen.
- Verwijder het project pas als alles een tijd goed gaat. De laatste back-up blijft bewaard.

## 6. Terug als het misgaat

Zolang niemand in Firebase heeft gewerkt, is er niets verloren:

1. In Supabase: `alter database postgres set default_transaction_read_only = off;` en de planning weer aanzetten met [`supabase/notifications.sql`](../supabase/notifications.sql).
2. Publiceer de vorige versie vanaf commit `68cd8c3`, met de omgeving die toen gold.

Is er al in Firebase gewerkt, dan moeten die wijzigingen met de hand mee terug.

## Testen

Lokaal, zonder account en zonder echte data:

```
cd firebase && npm install && npm run emulators      # in een eigen venster
cd firebase && npm test                              # regels, en hetzelfde gedrag als de demo
node workers/notify/test.mjs                         # meldingen en foto's
cd scripts/migrate && npm install && cd ../..
node scripts/migrate/test.mjs                        # de migratie, gelezen door de app
```
