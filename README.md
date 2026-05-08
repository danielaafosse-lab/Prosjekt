# EconSim

Norsk klasseromsøkonomisimulator for ungdomsskolen.

**Live:** https://econsim-5723c.web.app

---

## Hva er EconSim?

EconSim er en webbasert simulator hvor en hel klasse lever i en virtuell økonomi sammen. Læreren oppretter et klasserom med egen valuta (standard `KlasseKrone` / `KKr`), legger ut jobber, setter skattesatser og styrer rammene. Elevene jobber, sparer, investerer i fond, tar opp lån, betaler skatt og kan starte egne bedrifter med ansatte og eierandeler.

Målet er at elevene gjennom direkte erfaring forstår grunnleggende økonomiske begreper: hvordan lønn beskattes, hvorfor sparing gir renter, hva risiko er, hva det vil si å skylde penger, og hvordan en bedrift fungerer fra både eier- og ansatt-siden. Systemet er bygget på pedagogiske prinsipper om likhet (alle starter med samme saldo), rettferdighet (alle kan søke samme jobber), konsekvens (penger brukt er borte) og motivasjon (synlig fremgang).

EconSim kjører som en akselerert simulering der **1 uke i appen tilsvarer 1 måned i virkeligheten**, slik at en hel økonomisk syklus med lønn, renter og skatt kan oppleves i løpet av et skoleløp.

---

## Målgruppe og kontekst

- **Trinn:** 7.-10. klasse (13-16 år)
- **Land:** Norge
- **Språk:** Norsk bokmål (engelsk støttes også via språkbytte)
- **Brukskontekst:** Klasserom med én lærer og 20-30 elever
- **Læreplankobling:** Matematikk (regning, prosent, budsjett), samfunnsfag (økonomi, arbeidsmarked, ansvar)
- **Institusjon:** Utviklet ved HVL (Høgskulen på Vestlandet)

---

## Dokumentasjon

| Dokument | For hvem |
|----------|----------|
| [MANIFEST.md](MANIFEST.md) | AI / utviklere — samlet referanse |
| [docs/BRUKSANVISNING.md](docs/BRUKSANVISNING.md) | Lærere og elever (sluttbrukere) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Dypdykk i arkitektur |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Lokalt utviklingsoppsett |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Hvordan deploye til Firebase |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Drift, overvåkning, feilsøking i produksjon |
| [docs/TESTING.md](docs/TESTING.md) | Test-strategi, dekning, manuelle QA-rutiner |
| [CHANGELOG.md](CHANGELOG.md) | Versjonshistorikk |
| [CLAUDE.md](CLAUDE.md) | AI-konvensjoner (kort) |

---

## Kontakt

**Utvikler:** Daniel Alexander Andersen Fosse
**E-post:** econsim.no@gmail.com / daniel.a.a.fosse@gmail.com

---

## Lisens

All rights reserved. © 2025-2026 Daniel Alexander Andersen Fosse. Se [LICENSE](LICENSE) for fullstendig vilkår.

## Sikkerhet

Se [SECURITY.md](SECURITY.md) for trusselmodell, kjente begrensninger og rapportering av sårbarheter.
