# Poster Valley Schema Baseline v1 — lokaal uitvoeringsbewijs

Status: **canonical baseline inclusief de gerichte payment-idempotencyreparatie op Clean Staging
toegepast en geverifieerd; de allowlisted post-baseline-default-privilege-hardening is lokaal
tweemaal bewezen en nog niet remote toegepast**.

Deze hardeninguitbreiding omvat één commit en branchpush naar de bestaande Draft PR. Zij autoriseert geen migration
apply, `db push`, `db pull`, `migration fetch`, `migration repair`, remote reset,
Productionwijziging, Clean Staging-wijziging, deployment of merge.

## Identiteit en afbakening

- Repository: `Professor2080/poster-valley-kickoff-site`.
- Worktree:
  `C:\Users\pbenr\Projects\PosterValley\PosterValley\.worktrees\schema-baseline-v1`.
- Branch: `codex/schema-baseline-v1`.
- Start-HEAD: `f5e7fce47fa1a2b82ba34b51c24125cf1e418e9f`; actuele `origin/main`:
  `2027378daae5bb3f29354fcd449367ff1c648909`.
- Production: `epqpeoubkbftcvxjbqeo`.
- Clean Staging: `stbunwkgvxfwmbjivgos`, `eu-west-1`, `ACTIVE_HEALTHY`; de canonical baseline is
  daar onder aparte autorisatie toegepast en de schema-, grant- en contractcontroles zijn
  read-only uitgevoerd. De hardeningmigratie wordt in deze taak niet remote toegepast.
- Legacy Staging: `cdmocdodehjmcgtxicaj`; INACTIVE, niet benaderd en geen target.
- PR #18 en A4 vallen buiten de baselinepromotie.

Alle database-uitvoering in dit bewijs vond uitsluitend plaats op een tijdelijke lokale
PostgreSQL 17-cluster op `127.0.0.1`. Geen Supabase-project is verbonden of gewijzigd.

## Waarom geen Production `pg_dump` meer nodig is

De eerdere poging is gestopt en niet hervat. Er is geen wachtwoord gevraagd, geen directe
Productionverbinding gemaakt en geen geldige Productiondump gebruikt. De vervolgopdracht legt de
Production-inventaris read-only vast en bepaalt dat de baseline uitsluitend uit lokale bronnen
wordt gereconstrueerd.

Dat lokale bronbewijs is voldoende omdat:

1. `supabase/schema.sql` plus de zes Git-migraties zonder fout op een leeg lokaal
   Supabase-compatibel PostgreSQL 17-schema zijn uitgevoerd;
2. die keten vóór de reparatie exact de vastgelegde Productionaantallen opleverde: 13 tabellen,
   4 views, 2 enums, 23 routines, 9 triggers, 2 policies, 56 indexes en 71 constraints;
3. de finale baseline die bronketen bewust uitsluitend uitbreidt met de hieronder beschreven
   payment-idempotencykolommen, constraints en vier server-only RPC's;
4. de baseline tweemaal zelfstandig vanaf `template0` is uitgevoerd met identieke volledige
   fingerprints;
5. afwijkende Productiongrants expliciet als security hardening zijn behandeld en niet als
   ontbrekende broninformatie.

De vergelijking met Production blijft begrensd tot de vastgelegde inventaris. Dit bewijs claimt
geen nieuwe live cataloguswaarneming en claimt na de gerichte uitbreiding dus ook geen actuele
Productioncompatibiliteit. Die moet vóór Productionuitrol read-only worden bewezen.

## Lokale bronmatrix

| Bron | Finale objecten of bijdrage |
| --- | --- |
| `supabase/schema.sql` | 5 fundamentele tabellen: `drop_interest_requests`, `newsletter_signups`, `order_invitations`, `orders`, `payments`; 17 expliciete indexes; basale checks, PK/FK/UNIQUE en RLS |
| `20260720090000_admin_auth_data_foundation.sql` | enum `admin_role`; tabellen `admin_roles`, `admin_audit_events`, `entity_events`, `product_registry`; 2 routines; 3 triggers; 2 policies; 8 expliciete indexes; deterministische productconfiguratie |
| `20260720093000_admin_auth_data_hardening.sql` | finale `admin_roles_read_own`-policy; vaste lege `search_path` op 2 triggerfuncties; index `admin_roles_granted_by_idx` |
| `20260720110000_admin_operational_actions.sql` | tabellen `manual_shipping_quotes`, `operational_email_attempts`, `email_delivery_events`, `admin_operation_idempotency`; 7 routines; 2 triggers; orderkolommen/checks; 6 expliciete indexes |
| `20260720165432_admin_operational_actions_runtime_fix.sql` | finale body van `admin_a3_apply_action`; 2 FK-query-indexes |
| `20260721083831_a3_1_admin_customer_data_record_origin.sql` | enum `record_origin`; 7 routines; 3 triggers; 4 `security_invoker`-views; 3 expliciete indexes; finale origin/adres/e-maillineagestructuur |
| `20260721151023_admin_invitation_delivery_confirmation.sql` | 7 routines; 1 trigger; finale invitation-view; previous-tokenkolommen/check/index |

De 27 finale routines bestaan uit:

- 2 A1-triggerfuncties;
- 7 A3-routines, waarbij de runtime-fix de finale `admin_a3_apply_action` levert;
- 7 A3.1-routines;
- 7 A3.2-routines.
- 4 payment-start-RPC's voor claim, providerstart, afronding en reconciliatieblokkade.

De 9 finale niet-interne triggers bestaan uit 3 A1-, 2 A3-, 3 A3.1- en 1 A3.2-trigger.
De 57 indexes bestaan uit 36 niet-unique query-indexes plus 13 PK- en 8 UNIQUE-indexes. De 76
constraints bestaan uit 39 CHECK, 16 FK, 13 PK en 8 UNIQUE.

Er ontbreekt geen objectgroep uit de lokale bronset.

## Canonical baseline en historisch archief

- Eerste actieve migratie: `supabase/migrations/20260731113000_schema_baseline_v1.sql`.
- Grootte: 98.654 bytes; 1.513 regels.
- SHA-256: `e4db9505f590ba934543e1ed33e25a8172e66c430596047afe4321d619d8f510`.
- Exact allowlisted post-baselinepad:
  `supabase/migrations/20260731193947_harden_default_privileges.sql`.
- Hardening-SHA-256:
  `8d72db969029fa97595993e01a6ca2018aeedfd55ed242965db66a55528846b9`.
- `supabase/migrations/` bevat exact deze twee strikt oplopende bestanden. De runner blokkeert
  ontbrekende, verwisselde of onverwachte actieve migraties fail-closed.
- De zes bronmigraties staan byte-ongewijzigd in
  `supabase/migrations-archive/pre-baseline-v1/`; `manifest.json` bindt ieder oorspronkelijk pad en
  archivepad aan de SHA-256 en markeert het bestand als `historical_pre_baseline_generation`.
- Het archief is alleen provenance en mag nooit door de Supabase CLI als actieve migratie worden
  uitgevoerd.

De canonical baseline bevat directe finale DDL vanaf een leeg Supabase `public`-schema. Oude
backfill-`UPDATE`s, drop/recreate-stappen, ownership, migration history en Productiondata zijn niet
overgenomen. De enige top-level DML is:

- product `eurofighter-typhoon-a2`;
- lifecycle `interest`;
- `ON CONFLICT (product_code) DO NOTHING`.

Runtime-DML in de bewezen A3–A3.2-functies blijft behouden; dat is applicatielogica, geen
baseline-seed of backfill.

De tweede migratie wijzigt geen bestaand applicatieobject of bestaande object-ACL. Zij verwijdert
voor toekomstige `public`-objecten de standaardprivileges van `PUBLIC`, `anon`, `authenticated` en
`service_role` op tabellen, functies en sequences. De globale PostgreSQL-default `EXECUTE` voor
`PUBLIC` wordt globaal ingetrokken; de Supabase-rollen worden daarnaast schemaspecifiek
ingetrokken. Latere migraties moeten hun minimaal benodigde grants expliciet toevoegen.

## Applicatiecallers en minimale grants

De browserclient in `src/admin/supabase.ts` gebruikt de publishable key uitsluitend voor Supabase
Auth. Admingegevens en mutaties lopen via `/api/admin/*`. Alle publieke formulieren, uitnodigingen,
orders, betalingen en webhooks lopen via serverless API-routes met de server-only service role.

| Rol | Object | Privilege | Bewezen caller of contract |
| --- | --- | --- | --- |
| `anon` | `public` | geen | publieke formulieren gebruiken Vercel API-routes, niet rechtstreeks de Data API |
| `authenticated` | schema `public` | `USAGE` | toegang tot de twee geaccepteerde RLS-readcontracten |
| `authenticated` | `admin_roles` | `SELECT` | eigen actieve rol via `admin_roles_read_own`; server-side autorisatie blijft leidend |
| `authenticated` | `product_registry` | `SELECT` | geaccepteerde read-only product/lifecycleprojectie via `product_registry_read_authenticated` |
| `service_role` | schema `public` | `USAGE` | serverless REST/RPC |
| `service_role` | `drop_interest_requests` | `SELECT, INSERT` | `/api/interest`, Admin detail/list en RPC-context |
| `service_role` | `newsletter_signups` | `INSERT` | `/api/newsletter` |
| `service_role` | `order_invitations` | `SELECT, UPDATE` | invitation/quote/payment/webhook-routes; create/privileged updates via RPC |
| `service_role` | `orders`, `payments` | `SELECT, INSERT, UPDATE` | payment-, order- en webhook-routes |
| `service_role` | `admin_roles` | `SELECT` | `api/_admin.js` server-side allowlistcontrole |
| `service_role` | `admin_audit_events`, `entity_events`, `product_registry`, `manual_shipping_quotes`, `operational_email_attempts`, `email_delivery_events` | `SELECT` | Admin read/detail; mutaties uitsluitend via definer-RPC's waar van toepassing |
| `service_role` | 4 adminviews | `SELECT` | `api/admin/read.js` |
| `service_role` | 19 expliciete RPC's | `EXECUTE` | 15 admin-RPC's en 4 server-only payment-start-RPC's |
| alle Data API-rollen | `admin_operation_idempotency` | geen directe grant | alleen owner-context binnen bewezen `SECURITY DEFINER`-RPC's |
| alle Data API-rollen | 8 trigger/helperfuncties | geen `EXECUTE` | alleen interne trigger- of owner-callers |

Er zijn geen applicatiesequences; er is daarom geen sequencegrant nodig. De baseline voert eerst
expliciete `REVOKE ALL` uit op schema, tabellen, sequences en functies en grant daarna alleen de
bovenstaande surface. Resultaat in beide runs:

- 0 ACL-regels voor `PUBLIC`;
- 0 ACL-regels voor `anon`;
- geen directe operationele DML voor `authenticated`;
- geen `EXECUTE` voor `anon` of `authenticated` op interne functies;
- 19 expliciete service-role RPC-executerechten.

Dit verschil met de historische brede Production-ACL is:

**INTENTIONAL SECURITY HARDENING**

## Gerichte reparatie: `payment-start-not-idempotent-per-invitation`

De enige gevalideerde finding was MEDIUM/P2: opeenvolgende of gelijktijdige verzoeken aan
`/api/create-payment` konden voor één uitnodiging meerdere orders en meerdere Mollie-payments
aanmaken. De oorzaak was dat de API eerst losse browser-onbetrouwbare stappen uitvoerde en pas
daarna status schreef, zonder databaseclaim, canonieke payloadfingerprint, cardinaliteitsconstraint
of persistente provider-idempotencysleutel.

De lokale reparatie maakt de database leidend:

- `orders.invitation_id` is uniek: maximaal één canonieke order per uitnodiging;
- `(payments.order_id, payments.provider)` is uniek: maximaal één Mollie-paymentrecord per order;
- iedere order krijgt één unieke, persistente UUIDv4 in
  `payment_provider_idempotency_key`; dezelfde sleutel gaat exact als Mollie
  `Idempotency-Key` mee bij de enige geautoriseerde `POST /v2/payments`;
- `payment_request_hash` is een versiegebonden SHA-256-fingerprint van invitation-id, quantity,
  server-authoritatieve prijs-/shippingcomponenten en genormaliseerde naam/adres/voorwaarden;
  token, providercredential en andere secrets horen er niet in;
- dezelfde fingerprint hergebruikt het bestaande resultaat; een afwijkende fingerprint voor
  dezelfde uitnodiging geeft een expliciet conflict en maakt geen providercall;
- `payment_start_status` kent uitsluitend `claimed`, `provider_pending`, `provider_created` en
  `reconciliation_required`.

De vier nieuwe RPC's zijn `SECURITY DEFINER`, hebben `SET search_path TO ''`, gebruiken
schema-gekwalificeerde objecten en zijn alleen aan `service_role` gegund. `payment_start_claim`
vergrendelt eerst de invitation-rij met `FOR UPDATE`, maakt invitation en order atomair canoniek en
kent alleen vóór een providercall een lease van twee minuten toe. `payment_start_begin_provider`
markeert de onomkeerbare grens vóór netwerk-I/O. `payment_start_complete` legt providerpayment,
orderstatus en invitationstatus in één transactie vast. `payment_start_mark_reconciliation` zet een
onduidelijke provideruitkomst fail-closed zonder een verzonnen paymentrecord aan te maken.

### Retry- en uitkomstcontract

| Bestaande toestand | Servergedrag bij exact dezelfde payload | Nieuwe providercall |
| --- | --- | --- |
| `claimed`, geldige pre-providerlease | `202`, verwerking loopt | nee |
| `provider_pending` | `202`, verwerking loopt | nee |
| `reconciliation_required` of onbekende provideruitkomst | expliciete blokkade voor handmatige/providerreconciliatie | nee |
| payment `open` | exact dezelfde opgeslagen checkout-URL | nee |
| payment `paid` | betaaldstatus, geen checkout herstart | nee |
| payment `failed`, `expired` of `canceled` | terminale blokkade | nee |
| afwijkende request fingerprint | `409` conflict | nee |

Ook een uitnodiging die al `paid`, `expired` of `cancelled` is, wordt vóór een claim geblokkeerd.
Er bestaat bewust geen nieuwe betaalpoging onder dezelfde invitation; zo'n productbesluit vereist
later een nieuw expliciet model met eigen identifier en beleid.

Mollie's gedocumenteerde idempotencywindow is één uur. Binnen dat window geeft dezelfde POST met
dezelfde sleutel de gecachete uitkomst terug; gelijktijdige verwerking kan `409` geven en een andere
payload/endpoint met dezelfde sleutel geeft `400`. De applicatie doet daarom nooit een blinde
providerretry. Als de providercall een onduidelijke fout geeft, blijft de order
`provider_pending`/`reconciliation_required`; alleen een provider-read/reconciliatieroute mag later
de werkelijke uitkomst vaststellen.

### Gerichte regressiedekking

De gerichte tests dekken:

- opeenvolgende en gelijktijdige handlers met exact één providercall;
- response-loss en de fail-closed reconciliatiestatus;
- fingerprintconflict en normalisatie versus gewijzigde adres-/economische velden;
- hergebruik voor `open` en blokkade voor `paid`, `failed`, `expired`, `canceled` en onbekend;
- invitationstatussen `paid`, `expired` en `cancelled`;
- exact dezelfde providerheader op POST en geen idempotencyheader op GET;
- geheimhouding in providerfoutlogging;
- SQL-contracten voor cardinaliteit, locks, statussen, grants en vaste `search_path`.

Eindresultaat van deze ronde:

- gerichte payment-/Mollie-/SQL-tests: 19/19 groen;
- volledige suite: 140/140 groen;
- lint en production build: groen;
- repository-, secrets-, browser-exposure-, environment-, governance- en diffchecks: groen;
- `npm audit --omit=dev`: 0 vulnerabilities;
- `npm ci` rapporteerde uitsluitend 9 bestaande high-severity development-dependencywaarschuwingen;
  conform opdracht is geen auditfix of dependencywijziging uitgevoerd.

De bestaande onafhankelijke Codex Security-review heeft de finding gevalideerd en was inhoudelijk
volledig. Alleen de officiële final-report/SARIF-seal ontbrak door een tooling-lifecyclefout. De
canonieke findings- en coverage-artifacts waren compleet en toonden exact de MEDIUM/P2-finding
hierboven. Volgens de gecontroleerde reviewlimiet wordt geen nieuwe brede review gestart.

## Lokale PostgreSQL 17-tooling

- Bron: officiële door PostgreSQL gelinkte EDB Windows x64 binary archive.
- Downloadlink: `https://sbp.enterprisedb.com/getfile.jsp?fileid=1260307`.
- Bestand: `postgresql-17.10-2-windows-x64-binaries.zip`.
- Grootte: 333.927.270 bytes.
- SHA-256: `ef9b1e5e23d2e8a83914ba13d9dc536a72210fba53fd1808ff1f7e06bb22b106`.
- `postgres`, `initdb`, `pg_ctl`, `psql`, `createdb` en `dropdb`: PostgreSQL 17.10.
- Tijdelijke root: `%TEMP%\poster-valley-schema-baseline-v1\`.

Er is geen installer, Docker, Windows-service, UAC, machine-wide installatie of permanente
`PATH`-wijziging gebruikt.

## Lokale compatibility-harness

De permanente lokale bootstrap staat in `supabase/tests/schema-baseline-v1-bootstrap.sql` en bevat:

- rollen `anon`, `authenticated` en `service_role`;
- `service_role` met `BYPASSRLS`, zoals nodig voor lokale Supabase-compatibiliteit;
- schema `auth`;
- minimale `auth.users(id uuid primary key)`-stub;
- minimale `auth.uid()`-stub;
- schema `extensions`;
- extensies `pgcrypto` en `uuid-ossp`.
- de relevante gehoste Supabase-defaultprivileges, zodat de hardening ook lokaal tegen de verwachte
  uitgangssituatie wordt bewezen.

Bootstrap SHA-256:
`e9be53604e1ede96d095f2bf6e63d4b6685238f4a03e4576e39d91ec5f430fe0`.
De bootstrap bevat geen applicatieobject, Auth-gebruiker, klantdata of credential.

De runner `scripts/database/verify-schema-baseline.mjs` accepteert uitsluitend expliciet
geactiveerde loopbacktoegang en PostgreSQL 17. De tijdelijke server luisterde uitsluitend op een
lokale `127.0.0.1`-poort; datamap en logs bleven onder de tijdelijke taakroot. Er is geen
Windows-service geregistreerd. De uitvoervolgorde is vast: compatibility bootstrap, canonical
baseline, default-privilege-hardening en daarna de SQL-contracttests. Baseline- en hardening-SHA's
zijn expliciet gepind.

De historische fingerprintserialisatie bevatte het ruwe OID van de policyrol `authenticated`.
Omdat een OID geen semantisch schemaonderdeel is, reserveert de runner op een verse cluster vier
lokale wegwerprol-OID's en verifieert daarna expliciet de drie Supabase-compatibiliteitsrollen. Zo
blijft de reeds geaccepteerde fingerprint reproduceerbaar zonder de baseline of grants te wijzigen.

## Uitvoeringsbewijs

### Run 1

De formele run 1 is schoon vanaf `template0` uitgevoerd:

- bootstrap: geslaagd;
- canonical baseline: geslaagd zonder SQL-fout;
- default-privilege-hardening: geslaagd zonder SQL-fout;
- bestaande objectcontracten en nieuwe default-ACL-contracttests: geslaagd;
- baseline-SHA vóór/na identiek;
- hardening-SHA vóór/na identiek;
- structurele fingerprint:
  `6b21a5c80183d9cffed0b5395fcfe231934a55654788dbc3d3a08d0ec5c8409c`;
- volledige genormaliseerde fingerprint inclusief ACL en datacounts:
  `3c6d52fc996ded4cd77a316e1984315fd08aeec96e37ed66a07b58bb02613434`;
- default-ACL-fingerprint:
  `b7e26ee6708235ee0209bad22f59074ac0c2b9d835b93bbb88efa6da07798135`.

### Run 2

Run 1 is volledig verwijderd. Run 2 is opnieuw vanaf `template0` uitgevoerd met exact dezelfde
bootstrap, byte-ongewijzigde baseline en byte-ongewijzigde hardening:

- bootstrap: geslaagd;
- canonical baseline: geslaagd zonder SQL-fout;
- default-privilege-hardening: geslaagd zonder SQL-fout;
- bestaande objectcontracten en nieuwe default-ACL-contracttests: geslaagd;
- baseline-SHA vóór/na identiek;
- hardening-SHA vóór/na identiek;
- structurele fingerprint:
  `6b21a5c80183d9cffed0b5395fcfe231934a55654788dbc3d3a08d0ec5c8409c`;
- volledige genormaliseerde fingerprint:
  `3c6d52fc996ded4cd77a316e1984315fd08aeec96e37ed66a07b58bb02613434`;
- default-ACL-fingerprint:
  `b7e26ee6708235ee0209bad22f59074ac0c2b9d835b93bbb88efa6da07798135`.

Beide runs hadden bovendien:

- objectaantallen `13/4/2/27/9/2/57/76` voor
  tabellen/views/enums/routines/triggers/policies/indexes/constraints;
- 39 CHECK, 16 FK, 13 PK en 8 UNIQUE constraints;
- RLS op 13/13 tabellen en geen `FORCE RLS`;
- `security_invoker=true` op 4/4 views;
- de 4 nieuwe payment-RPC's als `SECURITY DEFINER` met `search_path=''`;
- alle 19 expliciete RPC-executerechten uitsluitend voor `service_role`, waarvan geen payment-RPC
  uitvoerbaar is door `PUBLIC`, `anon` of `authenticated`;
- alle vijf benoemde payment-cardinaliteits-/stateconstraints aanwezig;
- exact 1 `product_registry`-regel met lifecycle `interest` en authority `custom`;
- 0 rijen in alle 12 overige applicatietabellen;
- exact de minimale grantmatrix hierboven;
- geen standaardprivilege voor toekomstige `public`-tabellen, functies of sequences aan
  `PUBLIC`, `anon`, `authenticated` of `service_role`;
- een transactionele future-objectproef waarin geen impliciet privilege ontstaat en een expliciete
  smalle `service_role`-grant wel werkt, gevolgd door volledige rollback.

De structurele fingerprint is SHA-256 over een deterministische, geordende serialisatie van de
relevante PostgreSQL-catalogi. De volledige fingerprint voegt ACL's en het deterministische
datamanifest toe. Beide formele databases zijn volledig onafhankelijk vanaf `template0` opgebouwd;
run 1 is vóór run 2 verwijderd. SHA, omvang en regelcount van de baseline en de SHA van de hardening
bleven voor en na beide runs bytegelijk. De canonical structurele en volledige fingerprints bleven
ongewijzigd; de nieuwe default-ACL-fingerprint was in beide runs identiek.

### Gelijktijdigheidsbewijs

Op de tweede lokale database zijn na de fingerprints twee onafhankelijke `psql`-sessies gestart.
Zij claimden dezelfde invitation terwijl de eerste de rijlock vasthield. Het resultaat was:

- exact één claim-owner;
- exact één canonieke order voor de invitation;
- nul payments vóór providerafronding en exact één daarna;
- replay gaf dezelfde order, idempotencysleutel en checkout-URL terug;
- gewijzigde request hash gaf het bedoelde conflict;
- het afzonderlijke onduidelijke-providerpad eindigde in `reconciliation_required`, zonder
  paymentrecord en zonder nieuwe claim-owner.

De harness gebruikte alleen synthetische `.test`-gegevens en riep geen externe provider aan.

## Vergelijking met vastgelegde Production-inventaris

### Vastgelegde bronreferentie vóór reparatie

- 13 tabellen, 4 views, 2 enums, 23 routines, 9 triggers, 2 policies;
- 56 indexes en 71 constraints;
- RLS op alle 13 tabellen;
- alle 4 views `security_invoker=true`;
- de lokale bronketen verklaarde de vastgelegde Productioninventaris vóór deze reparatie.

### Gerichte lokale uitbreiding

- 4 routines;
- 7 orderkolommen;
- 2 CHECK-constraints;
- 3 UNIQUE-constraints/indexes, met verwijdering van 2 daardoor redundante niet-unique indexes;
- bijbehorende service-only grants.

Deze uitbreiding is lokaal bewezen, maar niet live tegen Production vergeleken en niet remote
toegepast. Zij mag daarom niet als bestaande Productionstructuur worden gepresenteerd.

### EXPECTED PLATFORM DIFFERENCE

- ownership;
- Supabase-beheerde schema's, rollen en extensiebeheer;
- lokale minimale Auth-stubs;
- migration history;
- Productiondata en sequencewaarden.

### INTENTIONAL SECURITY HARDENING

- historische brede Productiontabelgrants voor `anon` en `authenticated` zijn niet overgenomen;
- historische EXECUTE-defaults op trigger/helperfuncties zijn ingetrokken;
- alleen de expliciete minimale grantmatrix is aanwezig.

### BASELINE DEFECT

- de gevalideerde payment-start-idempotencyfinding is in de lokale baseline gerepareerd en gericht
  bewezen; remote alignment blijft een releasegate, geen lokaal defect.

### UNEXPLAINED DIFFERENCE

- geen.

## Statische veiligheidscontrole

- geen `DROP TABLE`, `DROP SCHEMA`, `DROP TYPE`, `TRUNCATE` of top-level klantdata-`UPDATE`;
- geen top-level insert buiten de deterministische productconfiguratie;
- geen dynamische SQL;
- geen ownership- of migration-historymutatie;
- geen PUBLIC-grant en geen anon-grant;
- geen brede authenticated DML;
- iedere `SECURITY DEFINER` heeft een vaste beperkte `search_path`;
- gebruikte extensionfuncties blijven schema-gekwalificeerd;
- geen persoonsgegevens, tokens, wachtwoorden, secrets of environmentwaarden;
- geen afhankelijkheid van Legacy Staging, A4 of PR #18 shipping.

## Vervolg na de baselinepromotie

1. Laat Draft PR #20, beide vereiste GitHub-checks en de exacte Vercel Preview groen worden; voer
   geen remote databaseactie uit vanuit deze hardeningtaak.
2. Merge uitsluitend na aparte goedkeuring.
3. Verifieer onder aparte autorisatie dat Clean Staging exact de canonical baseline als enige
   migration-historyversie bevat en de dry-run alleen
   `20260731193947_harden_default_privileges.sql` bevat.
4. Pas uitsluitend die hardeningmigratie toe en verifieer migration history, bestaande
   objectcontracten en toekomstige default-ACL-contracten read-only.
5. Rebase PR #18 pas na de baseline-merge, maak via de CLI een nieuwe latere timestamp en behandel
   de shippingmigration als gewone additive migration.
6. Voer vóór Production afzonderlijk de read-only cardinaliteitscontrole uit en keur daarna pas
   additive, backwards-compatible DDL goed; voer de initiële baseline-DDL nooit uit tegen het
   bestaande Productionschema.
7. Ontwerp en repeteer Production history reconciliation in een afzonderlijk infrastructure path.

## Database-first Productionalignment voor de paymentreparatie

Niet uitvoeren in deze taak. Vóór een applicatiemerge moet een afzonderlijk gecontroleerd werkblok:

1. branch/commit, exact Supabase-project, actuele migration history en schema read-only pinnen;
2. read-only controleren op meerdere orders per `invitation_id`, meerdere providerpayments per
   `(order_id, provider)`, onverwachte nullability en incompatibele bestaande statussen;
3. bij ook maar één duplicaat stoppen: geen automatische verwijdering of herclassificatie, maar een
   apart geautoriseerd reconciliatieplan met audittrail maken;
4. eerst nullable/additive kolommen en de vier server-only RPC's introduceren, zodat de nog actieve
   oude applicatie blijft werken;
5. unieke indexes/constraints pas toevoegen nadat de read-only cardinaliteitscontrole schoon is;
6. bestaande orders deterministisch backfillen met een versiegebonden request hash, state en unieke
   providerkey uit opgeslagen serverdata, zonder raw token of secret; daarna CHECK en `NOT NULL`
   valideren;
7. die exacte DDL eerst op Clean Staging uit committed `main`-history toepassen en daar
   concurrentie-, replay-, webhook- en rollbacktests met synthetische data uitvoeren;
8. uitsluitend na groen bewijs en aparte Productiongoedkeuring de databasewijziging uitrollen;
9. de nieuwe applicatie pas ná databasecompatibiliteit deployen en het oude contract pas in een
   latere contractfase verwijderen.

De unieke invitation- en providerpaymentcardinaliteit maakt ook de overgang met de oude app
fail-closed. Een constraintfout is veiliger dan een tweede providerbetaling, maar geldt niet als
voltooide end-to-end rollout: de RPC's en nieuwe app horen bij dezelfde gecontroleerde release.

## Production history reconciliation

Niet uitvoeren in deze taak. Een later afzonderlijk goedgekeurd runbook moet:

1. repository/main-SHA, baseline-SHA en exact Production-ref pinnen;
2. actuele Production migration history read-only verifiëren;
3. de oude basisversie en zes timestamp-aliases met actuele body-provenance bewijzen;
4. forward- en inverse-historyhandelingen op disposable infrastructuur repeteren;
5. aantonen dat de baseline structureel al aanwezig is en nooit als DDL op Production draait;
6. expliciete Productiongoedkeuring verkrijgen voor uitsluitend history metadata;
7. na iedere stap history en schemafingerprint controleren;
8. stoppen bij iedere onverwachte versie, body- of fingerprintafwijking.

Geen directe ad-hoc wijziging van `supabase_migrations.schema_migrations` is toegestaan.

## PR #18

PR #18 op `codex/shipping-confirmation` blijft ongewijzigd. De bestaande shippingmigration heeft
een timestamp vóór de baseline en hoort niet in Schema Baseline v1. Na baseline-merge moet PR #18
worden gerebased en moet de migration via `supabase migration new` een nieuwe, latere timestamp
krijgen. Dat is een afzonderlijk controlled-path werkblok met Clean Staging-gate. De
payment-idempotencyalignment moet bovendien vóór een appmerge zijn afgerond; PR #18 is in deze
reparatieronde niet gewijzigd.

## Rollback en recovery

- **In de Draft PR:** herstel uitsluitend via een gewone reviewbare vervolgcommit of Git-revert;
  er is geen remote databaserecovery nodig omdat niets is toegepast.
- **Vóór remote apply:** herstel uitsluitend via een goedgekeurde Git-revert/PR; oude migrations
  blijven als provenance beschikbaar.
- **Na Clean Staging apply:** Clean Staging is disposable en wordt onder aparte destructieve
  toestemming herbouwd vanuit de goedgekeurde history; gebruik geen Productioncopy.
- **Tijdens Production history reconciliation:** stop bij iedere afwijking en voer alleen de vooraf
  bewezen inverse historystappen uit. Voer nooit baseline-DDL tegen Production uit.
- **Na Production reconciliation:** een Git-revert alleen is onvoldoende; de oude historyrecords
  moeten via de vooraf bewezen inverse route herstelbaar blijven.

## Huidig besluit

De gerichte payment-idempotencyfinding en default-privilege-hardening zijn lokaal bewezen; twee
volledig lege lokale rebuilds zijn identiek, de default-ACL-contracttests zijn groen en de
concurrentieharness is groen. De canonical baseline blijft bytegelijk en is de immutable eerste
actieve migratie; alleen de exact gepinde hardening volgt. De baseline is op Clean Staging toegepast,
maar de hardening niet. De volgende databasegate is een apart geautoriseerde apply van uitsluitend
die hardeningmigratie; vóór Production blijven de read-only cardinaliteitscontrole en afzonderlijke
additive-DDL-goedkeuring verplicht.

**CANONICAL BASELINE ONGEWIJZIGD; DEFAULT-PRIVILEGE-HARDENING LOKAAL BEWEZEN**
