# Sikkerhetspolicy — EconSim

## Rapportér en sårbarhet

Hvis du finner en sikkerhetssårbarhet i EconSim, **ikke** opprett en offentlig issue. Send i stedet en kryptert e-post til:

**econsim.no@gmail.com**

Inkluder:
- Beskrivelse av sårbarheten
- Steg for å reprodusere
- Potensiell impact
- Eventuelle forslag til fix

Vi svarer innen 7 dager.

## Kjente begrensninger (per 2026-05-08)

### Firestore-regler er åpne

`firestore.rules` er for tiden satt til `allow read, write: if true`. Dette betyr at enhver som har tilgang til Firebase-prosjekt-IDen (som er offentlig i `index.html`) kan lese eller skrive ALL data i databasen.

**Trusler som er reelle:**
- Manipulasjon av data i et hvilket som helst klasserom
- All transaksjons- og brukerdata er offentlig lesbart
- Ingen rate-limiting på klient eller server

**Trusler som ikke er reelle:**
- Sensitiv personinformasjon (kun fornavn/brukernavn lagres — ingen fødselsnummer, adresse, e-post for elever)
- Faktiske penger (KKr er virtuell valuta)
- Lærer-passord (lagres som SHA-256-hash; ikke trivielt reverserbart)

**Hvorfor dette er sånn:** EconSim bruker egenutviklet auth (SHA-256, ingen Firebase Auth). Standard Firestore-regler kan ikke verifisere dette.

**Roadmap for tightening:** Migrer til Firebase Auth med Custom Tokens. Estimert 2-3 dager arbeid. Ikke prioritert for HVL-studentprosjekt med kjent og begrenset brukermasse.

### Cloud Functions e-post-credentials

Gmail SMTP-credentials lagres som Firebase Functions config (`firebase functions:config:set gmail.email=... gmail.password=...`). Aldri i version control.

App-passord (ikke regulært Gmail-passord) brukes — krever at 2FA er på.

### Klient-side cache i localStorage

Sensitiv brukerinformasjon (passord, sesjon-token) lagres ALDRI i localStorage — kun bruker-ID for sesjon-restore. Andre felt cacher data fra Firestore.

## Trusselmodell

EconSim er designet for et begrenset brukermiljø:
- Én lærer per klasserom
- ~30 elever per klasserom
- Bruk i norske ungdomsskoler under tilsyn

Det er ikke designet for:
- Anonym offentlig adgang
- Lagring av faktiske penger eller verdier
- Lagring av sensitiv personinformasjon utenfor fornavn/brukernavn
- Skala utover én skole

Hvis EconSim tas i bruk i større skala, må sikkerhetsmodellen revideres først (se "Roadmap for tightening" over).

## Dependency-sårbarheter

Vi kjører `npm audit` periodisk. `firebase-tools` har ofte transitive sårbarheter — vi vurderer impact før patching siden firebase-tools kjøres lokalt, ikke i produksjon.

## Kontakt

**Hovedutvikler / sikkerhetskontakt:** Daniel Alexander Andersen Fosse  
**E-post:** econsim.no@gmail.com / daniel.a.a.fosse@gmail.com
