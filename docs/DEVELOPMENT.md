# Lokal utvikling

Hvordan sette opp og kjøre EconSim lokalt. Se [DEPLOYMENT.md](DEPLOYMENT.md) for produksjonsdeploy og [ARCHITECTURE.md](ARCHITECTURE.md) for systemoversikt.

---

## Forutsetninger

- **Node.js** (anbefalt: aktiv LTS) og **npm**
- **Firebase CLI** — installert globalt eller via `npx` (prosjektet har `firebase-tools` som devDependency)
- **VS Code** med utvidelser (anbefalt):
  - **Live Server** (`ritwickdey.LiveServer`) — påkrevd for lokal kjøring
  - **ES6 String HTML** (`Tobermory.es6-string-html`) — syntax highlighting for HTML i template strings
  - **Path Intellisense** (`christian-kohler.path-intellisense`)
  - **ESLint** (`dbaeumer.vscode-eslint`)
  - **Norwegian Spell Checker** (`streetsidesoftware.code-spell-checker-norwegian-bokmal`)
  - **GitLens** (`eamodio.gitlens`)
  - **Better Comments** (`aaron-bond.better-comments`)

Installer alle utvidelsene fra terminal:

```bash
code --install-extension ritwickdey.LiveServer
code --install-extension Tobermory.es6-string-html
code --install-extension christian-kohler.path-intellisense
code --install-extension dbaeumer.vscode-eslint
code --install-extension streetsidesoftware.code-spell-checker-norwegian-bokmal
code --install-extension eamodio.gitlens
code --install-extension aaron-bond.better-comments
```

---

## Oppsett

```bash
# 1. Klon repoet
git clone <repo-url>
cd Prosjekt

# 2. Installer avhengigheter (Tailwind, Firebase CLI)
npm install
```

Det er ingen separat backend å starte — appen er en SPA som leveres som statiske filer og snakker direkte med Firebase Firestore.

---

## Kjøre lokalt

1. Åpne prosjektmappen i VS Code.
2. Høyreklikk `index.html` → **Open with Live Server**.
3. Appen åpnes i nettleser på `http://127.0.0.1:5500`.

Live Server gir automatisk reload ved endringer i HTML/CSS/JS.

### Demo-innlogging

Demo-data lastes fra `data/initial-data.json` når demo-klasserommet resettes.

| Type | Brukernavn | Passord |
|------|------------|---------|
| Lærer | `laerer` | `passord` |
| Elev (Kari Nordmann, konto 101) | `kari123` | `passord123` |
| Elev (Ole Hansen, konto 102) | `ola456` | `passord456` |
| Elev (Emma Larsen, konto 103) | `emma789` | `passord789` |

---

## npm-scripts

Definert i `package.json`:

| Script | Hva det gjør |
|--------|--------------|
| `npm run build:css` | Kompilerer Tailwind én gang fra `src/input.css` til `css/output.css` (minifisert) |
| `npm run watch:css` | Som over, men i watch-modus — rekompilerer ved endringer i `src/input.css` |
| `npm run build` | Alias for `build:css` |
| `npm run deploy` | Kjører `build` og deretter `npx firebase deploy --only hosting` |

### Tailwind-kompilering

CSS er kompilert til `css/output.css`. **Klasser som ikke finnes i den kompilerte filen vil ikke virke i nettleseren.** Hvis du legger til nye Tailwind-klasser i HTML, må CSS rekompileres:

```bash
npm run watch:css
```

For farger eller gradienter som ikke er i kompilert fil, bruk inline `style=`-attributt i stedet for å rekompilere.

---

## Firebase-konfigurasjon

Firebase-konfigurasjonen er hardkodet i `index.html` mot prosjektet `econsim-5723c`. Lokal kjøring snakker direkte med produksjons-Firestore — vær varsom med data du oppretter under utvikling.

Firestore-sikkerhetsregler ligger i `firestore.rules`.

---

## Kodekonvensjoner

Hentet fra eksisterende kodebase:

- **ES6+ moderne syntax** — `import`/`export`, `async`/`await`, destructuring.
- **camelCase** for JS-variabler og funksjoner.
- **JSDoc-kommentarer** for offentlige funksjoner.
- **DRY** — gjenbruk via services i stedet for å duplisere logikk.
- **Modulær struktur** — én ansvarsfelt per fil. Service-laget eier forretningslogikken; `main.js` koordinerer UI.
- **i18n** — ingen hardkodede norske tekster. Alle brukervendte strenger må gjennom `languageService.t('nøkkel')` eller `data-i18n`-attributter.
- **Async/await** — alle Firebase-kall awaites; alle display-refresh etter dataendring må awaites.
- **Klasserom-ID** — hent alltid via `dataService.getCurrentClassroomIdSync()`. Ikke dupliser lokal implementasjon.
- **XSS-sikkerhet** — bruk `escapeHtml()` fra `js/utils/helpers.js` på all brukergenerert input før HTML-rendering.

### Validering

- **Kontonummer:** 3 siffer, unikt innenfor klasserom.
- **Beløp:** positivt tall, maks 2 desimaler.
- **Brukernavn:** 3-20 tegn, alfanumerisk + underscore.
- **Passord:** minimum 6 tegn (demo); 8+ med kompleksitet anbefales i produksjon.
- **Jobbtittel:** 3-100 tegn.
- **Jobblønn:** positivt heltall.

---

## Feilsøking

- **Blank skjerm:** Åpne nettleserkonsoll (F12) og se etter import- eller Firebase-feil.
- **Tailwind-klasser virker ikke:** Klassen er trolig ikke i kompilert `css/output.css`. Kjør `npm run watch:css`.
- **Endringer reflekteres ikke:** Tøm nettleser-cache eller hard reload (Ctrl+Shift+R). Firebase Hosting har `Cache-Control: no-cache` på alle JS-filer i `firebase.json`, men nettleseren kan likevel cache.
- **Demo-data forsvant:** Logg inn som demo-lærer (`t1`) og bruk "Reset til demo-data". Resetter kun demo-klasserommet.
- **Sirkulær import-feil:** `languageService` må **ikke** importeres i `firebaseService.js`.
