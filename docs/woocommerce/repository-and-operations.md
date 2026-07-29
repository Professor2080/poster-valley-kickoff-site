# Voorstel voor shoprepository en beheer

Dit is een voorstel voor een later, afzonderlijk repository. Deze spike heeft het repository
niet aangemaakt.

## Repositorygrens

Voorgestelde naam: **`Professor2080/poster-valley-shop`**.

De scheiding is bewust:

- `poster-valley-kickoff-site` bezit de custom dropflow en zijn eigen deploys;
- `poster-valley-shop` bezit alleen reproduceerbare WooCommerce-configuratie, custom themacode,
  shoptests en operationele documentatie;
- de WordPress-database blijft de bron voor producten, voorraad en orders en wordt geen
  Git-dataset.

## Voorgestelde structuur

```text
poster-valley-shop/
├─ .github/workflows/
├─ config/
│  ├─ environments/
│  └─ woocommerce/
├─ docs/
│  ├─ architecture.md
│  ├─ operations.md
│  ├─ plugin-register.md
│  └─ restore-and-incident.md
├─ scripts/
│  ├─ bootstrap/
│  └─ verify/
├─ tests/
├─ wp-content/
│  ├─ mu-plugins/
│  └─ themes/poster-valley-shop/
├─ .env.example
├─ .gitignore
├─ composer.json
├─ composer.lock
└─ README.md
```

`mu-plugins` blijft leeg tenzij een kleine, geteste guardrail niet met native Woo/hostconfig
kan worden gerealiseerd. Businesslogica hoort er niet stilzwijgend in.

## Wat wel en niet in Git hoort

| Wel in Git | Niet in Git |
| --- | --- |
| Custom child theme en eigen kleine plugins/mu-plugins | WordPress core wanneer de managed host die beheert |
| Composer-/installatiemanifest en locks/checksums | `uploads`, database dumps, caches, logs en backups |
| Geschoonde, niet-geheime configuratiespecificaties | API-keys, salts, adminwachtwoorden, webhooks of `.env` |
| Idempotente WP-CLI/bootstrap- en verificatiescripts | Echte klanten, orders, adressen, stock exports |
| Pluginregister met eigenaar, versie en updatebeleid | Gekochte pluginzipbestanden zonder expliciet distributierecht |
| Architectuur-, restore-, incident- en release-instructies | `vendor`/buildoutput wanneer reproduceerbaar |
| Geautomatiseerde theme- en configuratiechecks | Productafbeelding-bronbestanden zonder passend publicatierecht |

Een `.env.example` bevat alleen variabelenamen en veilige placeholders. Secrets worden per
omgeving via de hostsecretstore ingevoerd en nooit door scripts teruggelezen of gelogd.

## Reproduceerbare configuratie

Volg deze voorkeursvolgorde:

1. pin WordPress-, Woo-, theme- en plugincompatibiliteit in het pluginregister;
2. gebruik Composer locks/checksums of een gecontroleerd WP-CLI-manifest als de gekozen managed
   host dat ondersteunt;
3. leg niet-geheime Woo-instellingen declaratief vast en pas ze idempotent toe;
4. verifieer na deployment de werkelijke waarden, HPOS, checkouttype en pluginstatus;
5. behandel database-export als backup/migratieartefact, nooit als configuration-as-code.

De WordPress.org Composer-repackagingroute kan een derde partij introduceren; de hostkeuze moet
eerst bepalen of Composer, WP-CLI of een gecontroleerde hostdeployment het kleinste
supply-chainrisico heeft. Premiumplugins worden uit een geautoriseerde private bron
geïnstalleerd en niet in een publiek Git-repository gekopieerd.

## Omgevingen

| Omgeving | Toegestaan | Verboden |
| --- | --- | --- |
| Local, later | Theme/configtests met synthetische fixtures en mocks | Remote database, live keys, echte mail/betalingen |
| Managed staging | End-to-end test met synthetische data, Mollie testmode en mailsink | Echte klanten, live Mollie, echte labels/pickups |
| Productie | Alleen na een apart goedgekeurd releaseplan | Handmatige ad-hocdeploy, testdata, debuglogging met PII |

Er is geen databaseverbinding of gedeeld secret tussen de bestaande Supabase-omgevingen en
WordPress nodig.

## Rollen en operationeel eigenaarschap

Minimale verantwoordelijkheden:

| Rol | Nodige bevoegdheden | Niet nodig |
| --- | --- | --- |
| Shopbeheerder | Product, prijs, voorraad, order/refund en Woo-instellingen | Hosting/root en secret-export |
| Fulfilment | Betaalde orders lezen, label/tracking verwerken, fulfilment voltooien | Plugins, gebruikers, prijzen, taxconfig |
| Technisch beheer | Updates, staging, backups, logs, restore en secrets roteren | Dagelijkse refundbesluiten |
| Financieel | Rapporten, refunds/reconciliatie en fiscaal bewijs | Theme/plugins/hosting |

Woo's ingebouwde Shop Manager is breder dan alleen fulfilment. Test vóór launch een smallere
custom rol als meerdere medewerkers toegang krijgen. Iedere persoon krijgt een eigen account,
2FA en alleen de kortst noodzakelijke toegang.

## Update- en releasecyclus

1. Registreer vendorversie, changelog, CVE/securitynotices, HPOS- en checkoutcompatibiliteit.
2. Maak herstelbare stagingbackup.
3. Update één logisch pakket in staging; draai checkout-, Mollie-, shipping-, refund- en
   e-mailregressies.
4. Beoordeel logs, performance en toegankelijkheid.
5. Plan productie in een rustig venster met vooraf vastgelegde rollback.
6. Controleer na release product, cart, checkout, webhook, admin en monitoring.

Een kritieke securitypatch kan versnellen, maar slaat backup, minimale stagingcheck en
post-releasecontrole niet over.

## Incident- en exitpad

- Bij checkout- of webhookincident: stop nieuwe shopverkopen indien nodig, maar verander nooit
  pending orders in betaald en routeer niet naar custom commerce.
- Behoud Woo-orders en audit/reconciliatie; een shoplink verbergen is geen orderrollback.
- Restore database en uploads als één consistente set of volg het hostadvies voor
  point-in-time herstel.
- Exporteer bij hostwissel database, uploads, custom code, DNS-/TLS-plan, logs binnen retentie
  en een plugin-/versie-inventaris.
- Test de nieuwe omgeving afgeschermd, verander DNS pas na expliciet releasebesluit en houd een
  tijdgebonden terugschakelplan.

## Gate voor repositorycreatie

Pascal moet eerst expliciet akkoord geven op:

- de aparte repository en private/public zichtbaarheid;
- de gekozen host en ondersteunde deploymentmethode;
- wie technisch en operationeel eigenaar is;
- licentie-/assetbeleid;
- branchbescherming, CI en secretmanagement.

Daarna kan een afzonderlijke implementatietaak de repository aanmaken en uitsluitend de
minimale child theme/configuratiebasis bouwen.
