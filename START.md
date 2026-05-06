# 🚀 EconSim - Økonomisimulator

**Versjon:** 2.3 - Forbedret UI/UX  
**Opprettet:** Oktober 2025  
**Sist oppdatert:** November 2025

---

## ⚡ HURTIGSTART

### 1. Åpne Live Server
- Høyreklikk på `index.html` i VS Code
- Velg **"Open with Live Server"**
- Åpner automatisk på: `http://127.0.0.1:5500`

### 2. Logg inn

**Lærer-konto:**
- Brukernavn: `laerer`
- Passord: `passord`

**Elev-kontoer:**
- `kari123` / `passord123` (Kari Nordmann - Konto: 101)
- `ola456` / `passord456` (Ole Hansen - Konto: 102)
- `emma789` / `passord789` (Emma Larsen - Konto: 103)

💡 **Du forblir innlogget** til du logger ut!

🔒 **Tips:** Klikk på 👁️ for å vise/skjule passord

---

## 💾 DATALAGRING (Hybrid-løsning)

### Hvordan det fungerer:
- **📂 Initial data** lastes fra `data/initial-data.json` ved første gangs bruk
- **💾 Endringer lagres** automatisk i nettleserens localStorage
- **📥 Eksporter data** via lærer-dashboardet (last ned som JSON-fil)
- **🔄 Reset data** for å gå tilbake til initial state

### Lærer-funksjoner i Overview:
- **💾 Eksporter data (JSON)** - Last ned all current data som JSON-fil
- **� Last opp data (JSON)** - Importer tidligere eksportert JSON-fil (erstatter ALL data)
- **�🔄 Reset til initial data** - Slett alt og last `data/initial-data.json` på nytt

### Viktig å vite:
- ✅ Data lagres **per nettleser** (Chrome og Firefox har separate data)
- ✅ Data lagres **per domene** (127.0.0.1:5500 ≠ localhost:5500)
- ✅ **Fortsett fra forrige dag:** Eksporter data → Last opp samme fil neste gang
- ✅ **Dele mellom datamaskiner:** Eksporter → Overfør fil → Last opp på annen maskin
- ✅ **Backup:** Eksporter JSON regelmessig for å ha backup av klasseromsdata

---

## 🎯 Demonstrasjons-scenarioer

### Scenario 1: Opprett jobber (Lærer)
1. Logg inn som **lærer**
2. Klikk på **Jobber-fanen**
3. Trykk **"Opprett ny jobb"**
4. Opprett en **Fast jobb**:
   - Tittel: "Tavlevask"
   - Lønn: 150 SKR
   - Type: Fast jobb
   - Ansett: Velg Ola
5. Opprett en **Prosjekt-jobb**:
   - Tittel: "Lage plakat"
   - Lønn: 300 SKR
   - Type: Prosjekt
   - Ansett: Velg Kari

✅ **Resultat:** Jobbene vises umiddelbart i kategoriene!

---

### Scenario 2: Betal lønn (Lærer)
1. Gå til **Jobber-fanen**
2. Under **Aktive jobber**, trykk **"Betal lønn"** på:
   - **Fast jobben** → Forblir aktiv, Ola får 150 SKR
   - **Prosjekt-jobben** → Avsluttes automatisk, Kari får 300 SKR
3. Se at prosjektet flytter til **"Avsluttede jobber"**

✅ **Resultat:** Fast jobb forblir, prosjekt avsluttes!

---

### Scenario 3: Send penger (Elev)
1. Logg ut og logg inn som **kari123**
2. Gå til **Oversikt-fanen**
3. Send 50 SKR til Emma (kontonr: **103**)
4. **Observer:** Saldo oppdateres ØYEBLIKKELIG
5. Transaksjonen vises i historikken

✅ **Resultat:** Umiddelbar oppdatering uten refresh!

---

### Scenario 4: Persistent login
1. Lukk nettleser-fanen
2. Høyreklikk `index.html` → Open with Live Server
3. **Observer:** Du er fortsatt innlogget!

✅ **Resultat:** Login huskes i localStorage!

---

## 📋 Hva læreren kan gjøre

✅ **Jobber-fanen:**
- Opprett fast eller prosjekt-jobber
- Ansett elever til jobber
- Betal lønn (enkeltvis eller alle)
- Avslutt jobber manuelt
- Gjenåpne avsluttede jobber
- Slett ledige jobber

✅ **Oversikt-fanen:**
- Gi penger til elever
- Trekk penger fra elever
- Se alle elevers saldo
- Se alle transaksjoner
- Hurtighandlinger (gi lønn til alle)

---

## 📋 Hva eleven kan gjøre

✅ **Jobber-fanen:**
- Se tilgjengelige jobber
- Søke på jobber
- Se mine aktive jobber
- Se tidligere jobber

✅ **Oversikt-fanen:**
- Send penger til andre elever
- Se min saldo (oppdateres live)
- Se transaksjonshistorikk
- Se sammendrag av aktive jobber

---

## 🔧 Teknisk informasjon

### Arkitektur
- **Frontend:** HTML5 + ES6 Modules + Tailwind CSS
- **Data:** localStorage (nettleser-lagring)
- **Session:** Persistent med localStorage
- **Refresh:** Automatisk live-oppdatering

### Datalagring
- All data lagres i nettleserens localStorage
- Data forblir til du clearer browser cache
- Ingen server eller database nødvendig
- Perfekt for demonstrasjon og testing

### Filer
```
/Prosjekt
├── index.html          # Hovedfil
├── START.md            # Denne filen
│
├── /css
│   └── styles.css      # Styling
│
├── /js
│   ├── main.js         # App entry
│   ├── config.js       # Konfig
│   ├── /core           # Kjernesystem
│   ├── /services       # Business logic
│   ├── /ui             # UI management
│   └── /utils          # Hjelpefunksjoner
```

---

## 💡 Tips for demonstrasjon

### Før du starter:
1. Åpne console (F12) for å se status-meldinger
2. Test med ulike brukerkontoer
3. Observer at alt oppdateres umiddelbart

### Problemer?
- **Blank skjerm?** → Åpne console (F12) og sjekk feilmeldinger
- **Data forsvinner?** → Ikke clear browser cache
- **Ikke innlogget?** → Sjekk at localStorage ikke er blokkert

### Reset data:
```javascript
// Åpne console (F12) og kjør:
localStorage.clear();
location.reload();
```

---

## 🎓 Pedagogisk bruk

Dette systemet kan brukes til:
- Lære elevene om økonomi og budsjett
- Simulere jobbmarked og arbeidsliv
- Praktisere regnskap og transaksjoner
- Bygge forståelse for digitale betalingssystemer

---

**Systemet er klart for demonstrasjon! Start Live Server og test alle funksjonene! 🚀**
