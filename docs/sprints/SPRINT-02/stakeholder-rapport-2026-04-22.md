# Stakeholder Rapport — HR SaaS
## Projectstand per 22 april 2026

| | |
|---|---|
| **Periode** | Sprint 1 afgerond (21 april) · Sprint 2 loopt t/m 5 mei |
| **Auteur** | pm |
| **Classificatie** | Intern — business stakeholders |

---

## Waar staan we?

**Sprint 1 — afgerond.** De technische basis staat en is live.
**Sprint 2 — gestart.** Authenticatie is in de afrondende fase.

```
Fundering         [==========] klaar
Demo live         [==========] klaar
Authenticatie     [========  ] 80% — laatste verificatiestap loopt
```

---

## Wat is er de afgelopen 2 dagen gebouwd?

### Sprint 1 — Fundament en demo (21 april, afgesloten)

In twee dagen is de volledige technische basis van het product neergezet en is een live demo-omgeving opgeleverd.

**Wat dat concreet betekent:**

- De applicatie is bereikbaar op `app.larsvdloo.com`. De API draait op `api.larsvdloo.com` en verwerkt requests via een database in Frankfurt (Neon Postgres). Alle verbindingen zijn versleuteld (TLS via Let's Encrypt).
- De eerste echte feature is live: medewerkersbeheer (aanmaken, bekijken, aanpassen, verwijderen). Persoonsgegevens zijn standaard gemaskeerd in de interface. Elke wijziging wordt vastgelegd in een auditlog. Bedrijven zijn volledig van elkaar gescheiden op databaseniveau — dit is de basis voor compliante multi-tenant werking.
- Het team heeft een werkende buildstraat ingericht: code wordt automatisch gecontroleerd, getest en uitgerold zodra een developer iets inlevert. Lokale checks zijn verplicht gesteld vóór elke push.
- Er waren 6 iteraties nodig om de demo-stack draaiend te krijgen (billing, bouwconfiguraties, platform-beperkingen). Dit is normaal voor een eerste deployment op nieuwe infrastructuur. Alle problemen zijn autonoom opgelost.

Na Sprint 1 is ook een reeks platformverbeteringen doorgevoerd: upgrade naar Node.js 24 LTS, opruimen van testinfrastructuur uit het productie-image, verwijderen van een verouderde staging-workflow die onnodige fouten genereerde.

### Sprint 2 — Authenticatie (22 april, loopt t/m 5 mei)

**Sprintdoel:** Een HR-admin en medewerker kunnen inloggen met e-mail en wachtwoord, zijn aan hun eigen bedrijfsomgeving gebonden, en de applicatie is bruikbaar voor een echte demo zonder technische workarounds.

**Bewuste keuze:** We bouwen email/wachtwoord-authenticatie met rolgebaseerde toegangscontrole (HR-admin, manager, medewerker). Single Sign-On via bedrijfsidentiteitssystemen (SAML/SSO) is bewust uitgesteld — dit is een enterprise-vereiste die pas relevant wordt zodra een klant een concreet verzoek stelt.

**Technische aanpak** (ter info, niet actionable): De sessie-architectuur is gedocumenteerd in een architectuurbeslissing. Korte inlogtokens in geheugen, langere vernieuwtokens via beveiligde cookie. Dit is de meest veilige combinatie voor de serverside-renderingstechnologie die we gebruiken.

**Status implementatie:** Alle 9 stories zijn gebouwd — backend (registratie, login, sessie, rollen), frontend (loginpagina, sessieopslag, paginabeveiliging) en geautomatiseerde tests. De implementatie is compleet en draait lokaal volledig. De laatste stap — geautomatiseerde end-to-end verificatie op de liveomgeving — loopt op dit moment.

---

## Wat doen we nu?

De komende dagen (t/m 5 mei) verfijnen we de authenticatielaag:

- Fijnafstelling van roltoewijzingen en toegangsregels
- Stabilisatie van de geautomatiseerde browsertests (Playwright)
- Mid-sprint check op de cookie-strategie: werkt de sessieverwerking correct in de browser inclusief automatisch vernieuwen?

---

## Wat is het volgende?

Sprint 2 sluit op 5 mei met review, retrospective en een formele release.

Sprint 3 (start 6 mei) wordt bepaald na de Sprint 2 retrospective. De twee meest waarschijnlijke kandidaten:

- **Onboarding-flow**: nieuwe medewerkers inwerken via een gestructureerde workflow
- **Verlofaanvragen**: aanvragen, goedkeuring, saldo

De keuze hangt af van wat de retro oplevert over teamcapaciteit en eventuele technische schuld.

---

## Risico's en openstaande beslissingen

| Onderwerp | Wat speelt er? | Status |
|---|---|---|
| Cookie-strategie | De sessieafhandeling in de browser vereist aanpassingen voor CORS en CSRF-beveiliging. De geautomatiseerde E2E-tests op staging zullen dit bevestigen of uitwijzen. | Wordt getest — verwacht deze sprint opgelost |
| Test-data in productie | Elke deploy zaait automatisch testgegevens in de database. Goed voor demo-gebruik, maar niet voor een echte klantomgeving: het vervuilt het auditlog. | Acceptabel voor demo-fase; moet opgelost zijn voor klant-0 |
| Infrastructuurcapaciteit | De API draait op een enkele server met 256 MB geheugen. Dit is voldoende voor demo's, maar te krap voor een productie-klant. Uitbreiding naar meerdere instanties is voorbereid, maar niet ingepland. | Geen risico voor demo; aandachtspunt bij klant-0 |
| MFA en wachtwoord-reset | Meerfactorauthenticatie en de "wachtwoord vergeten"-flow zijn niet in Sprint 2 meegenomen. Dit is een bewuste keuze: de basisflow moet eerst stabiel zijn. | P1 — staat gepland voor Sprint 3 of 4 |
