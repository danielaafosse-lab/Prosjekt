# EconSim — Bruksanvisning for lærere og elever

EconSim er en virtuell klasseromsøkonomi der elever lever i en simulert økonomi gjennom skoleåret. Læreren styrer rammene; elevene lever i økonomien.

**Live URL:** https://econsim-5723c.web.app

---

## Innhold

- [For lærere](#for-lærere)
  - [Komme i gang](#komme-i-gang)
  - [Klasseromsinnstillinger](#klasseromsinnstillinger)
  - [Legge til elever](#legge-til-elever)
  - [Lage jobber](#lage-jobber)
  - [Utbetale lønn](#utbetale-lønn)
  - [Skattesystem](#skattesystem)
  - [Lån](#lån)
  - [Bedrifter](#bedrifter)
  - [Statistikk](#statistikk)
- [For elever](#for-elever)
  - [Logge inn](#logge-inn-elev)
  - [Sjekkkonto](#sjekkkonto)
  - [Sparing og fond](#sparing-og-fond)
  - [Søke jobb](#søke-jobb)
  - [Ta opp lån](#ta-opp-lån)
  - [Starte bedrift](#starte-bedrift)
- [Pedagogiske tips](#pedagogiske-tips)
- [Vanlige problemer](#vanlige-problemer)

---

## For lærere

### Komme i gang

1. **Få lærerkonto:** Klikk "Er du lærer? Søk om tilgang" på forsiden. Fyll ut skjemaet og vent på godkjenning fra superadmin.
2. **Logg inn:** Bruk brukernavnet og passordet du fikk tildelt.
3. **Demo-klasserom:** Du kan utforske appen med `laerer` / `passord`.

### Klasseromsinnstillinger

På Innstillinger-siden styrer du:

- **Valuta:** Standard er KlasseKrone (KKr). Endre til hva du vil ("Soltaler", "Drømmemynt", osv.).
- **Startbalanse:** Hvor mye penger hver elev får ved opprettelse (standard 1000).
- **Skattesystem:** Skru på/av. Velg flat (én sats) eller progressiv (trinn).
- **Lån:** Skru på/av. Sett årlig rente.
- **Bedrifter:** Skru på/av. Sett startkapital-krav.
- **Tidsmodell:** Akselerert (1 uke = 1 måned) eller realistisk (1 uke = 1 uke).

**Anbefaling:** Start enkelt — bare jobber og lønn. Skru på sparing etter 1-2 uker. Så skatt. Så lån. Så bedrifter. Pedagogikken får tid til å sette seg.

### Legge til elever

1. Gå til "Elever"-fanen
2. Klikk "Legg til elev"
3. Skriv inn navn (fornavn er nok)
4. Brukernavn genereres automatisk (`fornavn123`)
5. Passord settes automatisk og vises én gang — skriv ned eller skriv ut

**Tips:** Print elev-listen med passord før første øktebanken.

### Lage jobber

1. Gå til "Jobber"-fanen
2. Klikk "Ny jobb"
3. Sett tittel (f.eks. "Klasseromsorden", "Plante-vanner")
4. Sett ukentlig lønn (f.eks. 50 KKr)
5. Sett om elever må søke (med søknad) eller om jobben er åpen

Elever ser jobben på sin Jobber-side og søker. Du kan se søknader og godkjenne én.

### Utbetale lønn

- **Manuelt:** I Jobber-fanen klikk "Betal lønn" på en aktiv jobb. Pengene trekkes fra sentralbanken og settes inn på elev-kontoen.
- **Alle samtidig:** "Betal alle lønninger" betaler ut for alle aktive jobber.
- **Automatisk:** Hvis tidsmodellen er akselerert kjøres scheduler hver mandag kl 08:00 og setter et trigger-dokument. Neste gang du logger inn vil scheduler-prosessering kjøre lønn automatisk.

### Skattesystem

Hvis aktivert trekkes skatt automatisk på lønn:

- **Flat skatt:** Én sats (f.eks. 20 %)
- **Progressiv skatt:** Tre trinn:
  - 0–500 KKr: 0 % (skattefritt minimum)
  - 501–1500 KKr: 25 %
  - 1500+ KKr: 35 %

Skatt går til klasserommets skattekasse (kontonummer 001). Du som lærer kan se og fordele skatte-pengene tilbake (f.eks. til klasse-fellesgoder).

### Lån

Hvis aktivert kan elever søke om lån:

1. Eleven søker via Lån-fanen
2. Læreren godkjenner i sin Lån-fane
3. Pengene utbetales fra sentralbanken
4. Rente trekkes månedlig fra elevens hovedkonto

Hvis eleven ikke har dekning til renten markeres lånet som mislighold.

### Bedrifter

Hvis aktivert kan elever starte bedrifter:

1. Eleven betaler startkapital (default 500 KKr) for å registrere bedrift
2. Bedriften får eget kontonummer (501–999)
3. Eleven (eier) kan ansette andre elever
4. Eier kan opprette bedriftsjobber med egen lønn
5. Profit fordeles via utbytte (etter lønn er betalt) — utbytteskatt 22 %
6. Eierandeler kan kjøpes/selges mellom elever

**Pedagogisk:** Lærer godkjenner bedrifter før de kan ansette. Sett krav om realistisk forretningsplan før godkjenning.

### Statistikk

Statistikk-fanen viser:

- Innloggings-aktivitet (per dag/uke/måned/år)
- Geo-statistikk (hvor i Norge brukerne logger inn fra)
- Klasseromsstatistikk: total formue, gjennomsnittlig saldo, Gini-koeffisient
- Per-elev statistikk: inntekt-kategorier, ukentlig transaksjons-volum

Eksporter til Excel hvis du vil presentere for skoleledelse.

### Slett klasse og start på nytt

Hvis du vil tilbakestille klasserommet til en blank tavle (slette alle elever, transaksjoner, jobber, bedrifter, lån, sparing — men beholde klassenavn og din egen lærer-konto):

1. Klikk **Innstillinger** (tannhjul-ikon)
2. Bla helt ned, klikk **Slett klasse og start på nytt**
3. Bekreft to ganger (advarsel + sikkerhetsspørsmål)

**Backup tas automatisk** før sletting — i opptil 90 dager kan superadmin gjenopprette klassen til den tilstanden den hadde før reset, hvis du angrer.

---

## For superadmin

Superadmin (kun én konto: `DanielAlexander`) har eget dashboard med utvidet tilgang.

### Backup-administrasjon

**Backups**-seksjonen nederst i dashboardet lister alle automatiske backups (klasserom-resets de siste 90 dagene). For hver backup:

- 👁️ **Forhåndsvis** — se hva som er i backupen (antall elever, transaksjoner, jobber, bedrifter)
- ↺ **Restore** — gjenopprett klasserommet fra denne backupen
- 🗑️ **Slett** — fjerne backupen permanent

Restore krever dobbel bekreftelse (klasserom-ID må skrives inn) og tar **pre-restore-backup først** — så operasjonen er reverserbar hvis noe blir galt.

### Lås lærer + klasserom

I klasserom-lista har hver rad en `🔒 Lås`-knapp ved siden av `🗑️ Slett`. Når du låser:

- Læreren kan ikke logge inn (får "Konto er låst"-feilmelding)
- Eksisterende sesjon ugyldiggjøres innen ~1 time
- Klassen kan låses opp igjen når som helst via samme knapp

Bruk dette for midlertidig sperring (f.eks. ved misbruk eller mens noe undersøkes) uten å slette klasserommet.

### Lærersøknader

`📬 Lærersøknader`-seksjonen viser ventende søknader fra brukere som har klikket "Er du lærer? Søk om tilgang" på loginsiden. Godkjenn ved å opprette en lærer-konto for dem.

---

## For elever

### Logge inn (elev)

1. Gå til https://econsim-5723c.web.app/
2. Skriv inn brukernavnet og passordet du fikk fra læreren
3. Klikk "Logg inn"

**Demo:** Du kan også prøve med `kari123` / `passord123`.

### Sjekkkonto

Hovedkontoen din har et 3-sifret kontonummer (101-199). Lønn og andre overføringer går hit.

På Oversikt-siden ser du:
- Saldo
- Siste transaksjoner
- Aktive jobber
- Aktive lån

### Sparing og fond

På Sparing-fanen har du to ekstra kontoer:

- **Sparekonto** (2XX) — fast rente 2 % årlig. Trygg.
- **Fondskonto** (3XX) — variabel avkastning ~8 % årlig. Risikofylt.

**Innskudd:** Skriv beløp og klikk "Sett inn". Pengene trekkes fra sjekkkontoen.

**Uttak:** Skriv beløp og klikk "Ta ut". Pengene flyttes tilbake til sjekkkontoen.

**Fond-tip:** Avkastningen kan være negativ! Ikke sett alle pengene dine i fond.

### Søke jobb

På Jobber-fanen ser du:

- **Tilgjengelige jobber:** klikk for å søke
- **Mine søknader:** status på dine søknader
- **Mine aktive jobber:** jobber du har fått, med ukentlig lønn

Når du blir tildelt en jobb begynner lønnen å komme automatisk.

### Ta opp lån

Hvis lærer har skrudd på lån:

1. Gå til Lån-fanen
2. Klikk "Søk om lån"
3. Skriv inn beløp og hvor lenge du ønsker lånet
4. Læreren må godkjenne søknaden

Når lånet er godkjent får du pengene på sjekkkontoen, og rente trekkes hver måned.

**Tip:** Sjekk renten først — kan du betale renten ut av jobblønna di?

### Starte bedrift

Hvis lærer har skrudd på bedrifter:

1. Gå til Bedrifter-fanen
2. Klikk "Start bedrift"
3. Skriv navn og betal startkapital (typisk 500 KKr)
4. Vent på lærergodkjenning
5. Når godkjent kan du:
   - Sette inn mer kapital
   - Lage jobber for andre elever
   - Ansette søkere
   - Betale ut utbytte til deg selv

Du kan også selge eierandeler til andre elever.

---

## Pedagogiske tips

### Progresjon gjennom året

| Uke | Anbefalt aktivering |
|---|---|
| 1–2 | Bare jobber og lønn. La elever bli kjent med systemet. |
| 3–4 | Skru på sparing. La dem se rente bygge seg opp. |
| 5–6 | Skru på skatt. Diskutér flat vs progressiv som klassetema. |
| 7–8 | Skru på lån. Diskutér risiko og økonomistyring. |
| 9+ | Skru på bedrifter. La elevene være "økonomer". |

### Diskusjons-spørsmål

- Hvorfor får sparekonto kun 2 % rente, mens fond gir 8 %? (Svar: risiko)
- Er flat skatt eller progressiv skatt rettferdig?
- Hva skjer hvis alle prøver å starte samme type bedrift?
- Hvor mange måneder tar det å betale ned et lån?

### Reset av klasserom

Hvis dataene blir for rotete kan læreren tilbakestille:

- Slett alle elever og lag på nytt (i Elever-fanen)
- Eller bruk superadmin-rollen til å resette demo-data

---

## Vanlige problemer

| Problem | Løsning |
|---|---|
| "Innlogging fungerer ikke" | Sjekk at både brukernavn og passord stemmer eksakt (case-sensitive). Be lærer om passord-reset hvis glemt. |
| "Saldo viser feil" | Trykk F5 for å laste siden på nytt. Sjekker mot Firebase. |
| "Lønn kom ikke" | Lærer må trykke "Betal lønn" eller scheduler må kjøre. |
| "Får ikke søkt på jobb" | Du har sannsynligvis allerede søkt. Sjekk "Mine søknader". |
| "Fondet sank" | Det er meningen — fond har risiko. Du tjener over tid hvis du holder. |
| "Skatten ble for høy" | Hvis progressiv: sjekk hvilke trinn du er i. Snakk med lærer om innstillinger. |
| "Bedriften ble nedlagt" | Hvis ikke nok kapital til å betale lønn over tid, kan bedriften gå konkurs. |
| "Glemt passord" | Klikk "Glemt passord?" og oppgi e-post (hvis registrert). Ellers: spør lærer. |
| Skjermen er feil | Skriv `resetEconSim()` i nettleser-konsollen (F12). Dette tilbakestiller bare lokal cache, ikke Firebase-data. |

---

## Spørsmål eller feil?

**Send e-post til:** econsim.no@gmail.com

Beskriv hva du gjorde, hva som skjedde, og helst skjermbilde. Vi svarer så raskt vi kan.
