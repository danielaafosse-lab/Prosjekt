# Superpowers — specs og plans

Designdokumenter (`specs/`) og implementeringsplaner (`plans/`) som styrer endringer i EconSim.

## Konvensjon

- **specs/** — designdokumenter som beskriver *hva* som skal bygges og *hvorfor*. Beholdes som arkitektur-referanse selv etter at arbeidet er fullført.
- **plans/** — trinn-for-trinn implementeringsplaner som forteller *hvordan*. Slettes når planen er fullført, fordi git-historikken og spec-en dekker resten.

Filnavnformat: `YYYY-MM-DD-kort-beskrivelse.md`.

## Aktive (ufullstendige) specs

| Fil | Status | Kommentar |
|---|---|---|
| [specs/2026-05-06-econsim-v6-restructure-design.md](specs/2026-05-06-econsim-v6-restructure-design.md) | Pågår | v6 fase 4 (template-uttrekk fra `index.html`) og fase 5b (controller-uttrekk fra `main.js`) er fortsatt utestående. |
| [specs/2026-05-08-fase5b-controller-extraction-guide.md](specs/2026-05-08-fase5b-controller-extraction-guide.md) | Pågår | Detaljert guide for hvordan controllers og UI-helpers skal trekkes ut av `main.js` feature-for-feature. 8 av 13 features er ferdig. Gjenstår: `i18n`, `classroom`, `savings`, `taxes`, `scheduler`. |

## Fullførte specs (beholdt som arkitektur-referanse)

| Fil | Fullført | Kommentar |
|---|---|---|
| [specs/2026-05-09-firebase-auth-migration-design.md](specs/2026-05-09-firebase-auth-migration-design.md) | 2026-05-09 | Firebase Auth-migrering med Custom Tokens, strenge Firestore-rules, backup/restore/lås. Implementeringsplanen er slettet; spec-en er beholdt som design-referanse. |

## Aktive plans

Ingen for øyeblikket — alle pågående arbeider styres direkte fra spec-ene over.

---

## Slettede planer (for historikk)

Disse var fullt utført og er fjernet fra repoet (full historikk finnes i git-loggen):

- `plans/2026-05-09-firebase-auth-migration.md` (slettet 2026-05-10) — 46 oppgaver, alle utført. Se v6.1.0 i [CHANGELOG.md](../../CHANGELOG.md) for resultatene.
- `specs/2026-05-08-firebase-auth-migration-prompt.md` (slettet 2026-05-10) — utdatert prompt-versjon for fresh-chat-bruk. Erstattet av `specs/2026-05-09-firebase-auth-migration-design.md` allerede 2026-05-09.
