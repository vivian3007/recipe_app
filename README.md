# Weekmenu 🍽️

Een app voor Android en iPhone om samen met het gezin het avondeten te plannen.

- **Recepten** – een grote gedeelde verzameling recepten van het hele gezin, met zoeken, labels en een foto.
- **Mijn favorieten** – tik op het hartje om een recept aan je eigen collectie toe te voegen.
- **Weekplan** – bovenaan staat wie welke dag kiest: één persoon de hele week, of gemixt (mama 3 avonden, jij 4). Met het potloodje pas je dat aan. Per dag kies je een gerecht en voor hoeveel personen, en je sleept gerechten naar een andere dag om te wisselen. Iedereen in het gezin ziet het plan.
- **Boodschappen** – alle ingrediënten van de week bij elkaar opgeteld en omgerekend naar het aantal personen (500 g + 1 kg = 1½ kg). Afvinken in de winkel en het lijstje delen via WhatsApp e.d.
- **Gezin** – iedereen maakt een eigen account en wordt lid met een gezinscode.

Gebouwd met [Expo](https://expo.dev) (React Native, één codebase voor iOS en Android) en [Supabase](https://supabase.com) (accounts + database).

---

## Snel proberen: demomodus

Zolang er geen Supabase-gegevens in `.env.local` staan, start de app vanzelf in **demomodus**. Je hoeft dan niet in te loggen, en er staan voorbeeldrecepten en een voorbeeldgezin klaar. Alles wordt alleen op je eigen telefoon bewaard, dus delen met het gezin werkt nog niet.

```bash
npm install
npx expo start
```

Scan de QR-code met de **Expo Go**-app (App Store / Play Store). Telefoon en computer moeten op hetzelfde wifi zitten; lukt dat niet, gebruik dan `npx expo start --tunnel`.

Via **Gezin → Demo opnieuw beginnen** zet je de voorbeelddata terug. Wil je de demomodus gebruiken terwijl Supabase al is ingesteld, zet dan `EXPO_PUBLIC_DEMO=1` in `.env.local`.

## 1. Supabase instellen (eenmalig, ±5 minuten)

1. Maak een gratis account op [supabase.com](https://supabase.com) en klik **New project**.
2. Ga naar **SQL Editor → New query**, plak de inhoud van [`supabase/schema.sql`](supabase/schema.sql) en klik **Run**.
3. *(Aanrader)* Ga naar **Authentication → Sign In / Providers → Email** en zet **Confirm email** uit. Dan kan iedereen meteen inloggen na het aanmaken van een account, zonder bevestigingsmail.
4. Ga naar **Project Settings → API Keys** en kopieer de **Project URL** en de **publishable key**.
5. Kopieer `.env.example` naar `.env.local` en vul ze in:

   ```
   EXPO_PUBLIC_SUPABASE_URL=https://jouwproject.supabase.co
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

## 2. De app starten

```bash
npm install
npx expo start
```

Installeer **Expo Go** op je telefoon (App Store / Play Store) en scan de QR-code. Telefoon en computer moeten op hetzelfde wifi-netwerk zitten.

## 3. Op de telefoons van het hele gezin zetten (gratis)

Beide routes gaan via een gratis Expo-account (`npx eas-cli@latest login`). De Supabase-gegevens staan als variabelen in de EAS-omgeving `preview`, anders start de gebouwde app in demomodus.

**Android: installeerbare app (APK)**

```bash
npx eas-cli@latest build --platform android --profile family
```

Na het bouwen krijg je een link. Open die op een Android-telefoon, download de app en sta de installatie toe ("onbekende bron").

**iPhone: web-app op het beginscherm**

Een echte iPhone-app buiten de App Store kan niet gratis. De web-versie wel:

```bash
npx expo export --platform web
npx eas-cli@latest deploy --prod
```

Open de link in **Safari**, tik op **Deel → Zet op beginscherm**. Weekmenu krijgt dan een icoon en opent schermvullend. Automatisch recepten ophalen van een link werkt in de web-versie niet (de link wordt wel bewaard).

**Een nieuwe versie uitbrengen**

- Android (automatische update, geen nieuwe APK nodig):
  ```bash
  npx eas-cli@latest update --channel family --environment preview --message "Wat er veranderd is"
  ```
  De app haalt de update op bij het opstarten en vraagt of hij wil herstarten.
- Web/iPhone: opnieuw `npx expo export --platform web` en `npx eas-cli@latest deploy --prod`; bij de volgende keer openen is iedereen bij.
- Een nieuwe APK is alleen nodig als er nieuwe native onderdelen bij komen (bijvoorbeeld een nieuwe Expo-module). De app krijgt dan geen update die niet bij zijn versie past.

## Hoe gebruik je het?

1. Eén persoon maakt een account en kiest **Nieuw gezin starten**.
2. Bij **Gezin** staat de gezinscode. Deel die met de anderen; zij maken een account en vullen de code in.
3. Voeg recepten toe met de **+** knop. Vul de hoeveelheden in voor het aantal personen waar het recept voor is. Staat het recept op een website? Plak de link en tik op **Ophalen**: de app neemt titel, ingrediënten, bereiding en foto over (dat lukt bij de meeste receptensites). Lukt het niet, dan wordt de link bewaard en kan iedereen het recept via **Bekijk origineel recept** op de website lezen.
4. In **Weekplan** tik je op het potloodje bij **Wie kiest er?** om de week te verdelen. Daarna kies je per dag een gerecht (of vanuit een recept: **Toevoegen aan weekplan**). Houd ≡ vast om een gerecht naar een andere dag te slepen; staat daar al iets, dan wisselen ze om.
5. Wil je een gerecht van iemand anders net even anders, bijvoorbeeld met kip in plaats van gehakt? Tik in het weekplan op **Aanpassen**. Je zet er een opmerking bij en past de ingrediënten aan voor die ene avond; het originele recept blijft hetzelfde.
6. In **Boodschappen** staat automatisch alles wat je nodig hebt, inclusief je aanpassingen.

## Projectstructuur

```
src/app/            schermen (Expo Router, elk bestand is een scherm)
  (auth)/           inloggen en registreren
  (tabs)/           Recepten, Weekplan, Boodschappen, Gezin
  recipe/           recept bekijken en bewerken
  pick-recipe.tsx   gerecht kiezen voor een dag
  add-to-week.tsx   recept op een dag zetten
src/components/     herbruikbare onderdelen
src/lib/            Supabase-client, data-functies, omrekenen van hoeveelheden
supabase/schema.sql database, beveiliging en foto-opslag
```

Elk gezin ziet alleen zijn eigen recepten en weekplannen (geregeld met Row Level Security in de database).
