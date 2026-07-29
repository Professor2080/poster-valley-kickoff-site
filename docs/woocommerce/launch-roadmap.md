# Besluiten- en launchroadmap

Deze roadmap maakt de WooCommerce-shop omkeerbaar en gefaseerd. Elke fase heeft een eigen
toestemming; een afgeronde documentspike autoriseert geen provisioning of productiehandeling.

## Besluit in één zin

Behoud `www.postervalley.nl`, bouw later een native managed WooCommerce-shop op
`shop.postervalley.nl`, gebruik voor v1 geen headless/proxy, en laat ieder `in_stock` product
via dezelfde onveranderlijke SKU naar zijn Woo-productpagina linken.

## Fasen

### B0/B1 — onafhankelijke architectuurspike (deze documentset)

Opgeleverd in Git-werkboom, niet gepubliceerd:

- topologievergelijking, bron- en eigenaarschapsgrenzen;
- managed-hostshortlist, kostenband en staging-/restore-eisen;
- minimaal pluginregister met risico, kosten en alternatieven;
- product-/SKU-/stockmodel voor circa tien productslots zonder nepvoorraad;
- NL/EU/buiten-EU-verzendrichting, carrierbake-off, douane- en fiscaliteitsvragen;
- Mollie-testmatrix, designrichting, repositoryvoorstel en rollbackpad.

Exit: Pascal kan de besluiten hieronder nemen en open leveranciers-/accountantsvragen
toewijzen. Geen technische omgeving is nodig om deze fase af te ronden.

### B2 — afzonderlijke repository en lokale basis

Alleen na apart akkoord:

1. maak `Professor2080/poster-valley-shop` met branchbescherming en CI;
2. voeg de minimale Storefront child theme, pluginmanifesten, niet-geheime config en tests toe;
3. pin gekozen compatibiliteitsmatrix; voeg nog geen live secrets of productdata toe;
4. bouw een synthetische lokale product-/checkoutfixture als de hostworkflow dat ondersteunt;
5. review security, accessibility en reproduceerbaarheid.

Exit: schone bootstrap/verificatie, geen remote database, geen echte mail/betaling/label.

### B3 — managed staging provisionen

Alleen na host-/budgetakkoord:

1. koop geselecteerd plan of pilot en leg DPA/SLA/exitvoorwaarden vast;
2. maak geïsoleerde staging, noindex/toegangsbeperking, unieke accounts en 2FA;
3. configureer backups, monitoring, logs en e-mailsink/suppressie;
4. installeer alleen geregistreerde, gepinde plugins en child theme;
5. voer de synthetische backup-/restoreproef uit.

Exit: restorebewijs, gescheiden secrets/data, geen live Mollie/mail/shipping.

### B4 — commerceconfiguratie en end-to-endbewijs

1. meet verpakkingen en stel goedgekeurde zones/flat rates in;
2. laat accountant de tax-/OSS-/factuurconfig valideren;
3. voer de MyParcel- of Sendcloud-bake-off uit en kies er één;
4. draai de volledige Mollie-testmatrix, stock-, refund-, e-mail- en fulfilmenttests;
5. voer circa tien **echte, bevestigde** producten als concept in; lege planningsslots worden
   niet geïmporteerd;
6. test child theme, mobile, keyboard, screenreader-basics, performance en SEO/noindex;
7. test incident, plugin-disable, webhookvertraging en herstel.

Exit: ondertekend bewijs per gate en complete lijst bekende beperkingen.

### B5 — launch readiness review

Eigenaren keuren expliciet goed:

- hosting/security/restore en operationeel rooster;
- productteksten, rechten, prijzen, stock en verpakking;
- tax/OSS/factuur/reconciliatie door accountant;
- voorwaarden, levering/retour/privacy/cookies door eigenaar/jurist;
- live Mollie-, shipping- en mailconfiguratieplan zonder keys in documentatie;
- DNS, SEO, analytics, monitoring, cutover en rollback per SKU.

Exit: exact commit/versies, omgeving, uitvoerders, venster, smoke tests en stopcriteria
vastgelegd. Nog niet live.

### B6 — productie (aparte expliciete toestemming)

Mogelijke volgorde na goedkeuring:

1. provision productie en secrets via gecontroleerde hostprocessen;
2. herstel/deploy uitsluitend de goedgekeurde shopstate; geen stagingklantdata;
3. configureer DNS/TLS, monitoring en productiebackups;
4. voer een afgebakende smoke test uit volgens een goedgekeurd betalings-/refundplan;
5. publiceer eerst één geteld product in Woo;
6. verander daarna dat ene custom registryrecord gecontroleerd naar `in_stock` met Woo-URL;
7. verifieer één kooproute, status, mail en fulfilment; rol pas daarna verder uit.

Geen stap is met deze spike uitgevoerd of geautoriseerd.

## Besluiten voor Pascal

| # | Besluit | Aanbevolen default | Benodigde informatie / eigenaar |
| ---: | --- | --- | --- |
| 1 | Topologie | Bevestig ADR-004: native `shop`-subdomein | Pascal |
| 2 | Structureel hostbudget/contract | EUR 20–60/mnd excl. btw; korte pilot/maandtermijn waar mogelijk | Pascal + offertes |
| 3 | Host | Cloud86 alleen na open-puntencheck; RAIDBOXES/Kinsta als managed premiumalternatief | Pascal + technisch reviewer |
| 4 | Repository | Aparte `Professor2080/poster-valley-shop` | Pascal; nog niet aanmaken |
| 5 | Launchlanden | Eerst NL; BE/DE pas na tarieven/fiscaliteit; buiten EU blokkeren | Pascal + operations/accountant |
| 6 | Shippingplatform | MyParcel-bake-off bij NL-first; Sendcloud alleen bij bewezen multi-carrierbehoefte | Pascal + fulfilment |
| 7 | Flat rates | Pas na drie fysieke packouts en actuele offerte | Operations + Pascal |
| 8 | Producttax, shippingtax, OSS | Niet configureren zonder schriftelijke accountantsbevestiging | Accountant |
| 9 | Factuurplugin | Niet installeren tenzij accountant PDF/nummering vereist | Accountant + finance |
| 10 | Analytics/cookies | Geen niet-essentiële tracking in v1 als die niet nodig is | Pascal + privacy/juridisch |
| 11 | Theme/checkout | Storefront child theme; kies Blocks/classic op pluginbewijs | Pascal + technisch reviewer |
| 12 | Assortiment | Alleen echte designgegevens en getelde voorraad; geen tien fictieve producten | Pascal + product/fulfilment |
| 13 | Rollen | Eigen admins + 2FA; aparte beperkte fulfilmentrol indien meerdere medewerkers | Pascal + operations |
| 14 | Operationele mail | Provider/sender/deliverability apart besluiten; staging blijft sink/suppressed | Pascal + operations |

## Risicoregister

| Risico | Impact | Vroege maatregel | Stopcriterium |
| --- | --- | --- | --- |
| Twee commerceautoriteiten voor één SKU | Verkeerde prijs/stock/order | Lifecyclecontract en handmatige cutovercheck | Meer dan één actieve kooproute |
| Webhook/redirect verkeerd geïnterpreteerd | Onbetaalde fulfilment | Providerstatus ophalen, idempotentie, testmatrix | Fulfilment vóór `paid` |
| Pluginupdate breekt checkout/shipping | Omzet-/orderincident | Minimale plugins, pinning, staging, rollback | Kritiek scenario faalt |
| Hostingbackup is niet herstelbaar | Dataverlies/lange storing | Pre-salesgate en echte restoreproef | Restore/RTO niet bewezen |
| Verkeerde btw/OSS/factuurconfig | Fiscale correcties | Accountant sign-off met rekenvoorbeelden | Geen schriftelijke bevestiging |
| Flat rate dekt pakket niet | Verlies/schade | Packouts, actuele offertes en toeslagen | Afmetingen/gewicht onbekend |
| Buiten-EU zonder douaneproces | Blokkade/kosten/klachten | Buiten-EU v1 geblokkeerd | Rest-of-world checkout actief |
| Plugin/host deelt te veel PII | Privacy-/securityincident | Dataflowreview, least privilege, logredactie | Onnodige PII of secret in log/derde |
| Merk-/SEO-splitsing | Vertrouwens-/vindbaarheidsverlies | Child theme, navigatie, sitemaps en unieke inhoud | Shop lijkt andere verkoper of duplicate content |
| Staging stuurt echte mail/betaling/label | Klant-/financiële impact | Testkeys, `.test`-data, sink en labelblokkade | Live credential of echte ontvanger |

## Cutover-rollback per SKU

Rollback is geen databasewissing:

1. stop/verberg het Woo-product of zet het veilig op out-of-stock;
2. behoud alle bestaande Woo-orders, refunds en auditdata;
3. laat pending/paid orders volgens hun echte providerstatus afhandelen;
4. verwijder de hoofdsite-shoplink of verander lifecycle alleen via een afzonderlijk
   geautoriseerde, server-side handeling die open orders en ownership controleert;
5. activeer niet automatisch custom preorder/reservering als vervangende kooproute;
6. documenteer oorzaak, stocktelling en reconciliatie vóór een nieuwe poging.

Bij een platformbrede storing kan de shoplink tijdelijk worden verborgen terwijl de publieke
site/custom flows online blijven. Herstel via de geteste hostbackup en controleer database +
uploads + payments/webhooks voordat nieuwe checkout wordt geopend.

## Verificatiechecklist vóór B5

- actuele component-/pluginversies en checksums;
- lint/static checks voor custom code en child theme;
- WC/WordPress/PHP/HPOS/checkoutcompatibiliteit;
- desktop, mobiel, toetsenbord, focus, formuliererrors en orderbevestiging;
- product-SKU uniqueness, stock hold/restore, no-backorders;
- shippingzonegrenzen, gemengde classes, toeslag- en geen-methodegevallen;
- tax/reken-/refundvoorbeelden ondertekend;
- alle Mollie-scenario's, dubbele/vertraagde webhooks en providerrefunds;
- mails uitsluitend in sink, juiste inhoud/aantallen;
- tracking/label alleen na `paid`;
- WAF/cache uitsluitingen voor cart/checkout/account/webhooks;
- backup/restore, incidentcontacten en exitexport;
- privacydataflow, retentie, logs en rolrechten;
- noindex op staging en juiste sitemap/schema/canonical op de latere productie;
- één commerceautoriteit en één kooproute per SKU.

## Veiligste eerstvolgende actie

Zonder een systeem te wijzigen:

1. stuur dezelfde tien pre-salesvragen uit
   [`hosting-and-staging.md`](hosting-and-staging.md) naar Cloud86, RAIDBOXES en Kinsta
   (Hosting.NL als reserve);
2. laat Pascal het maximale structurele budget, launchlanden en shippingbake-off kiezen;
3. stuur de fiscale vragen uit
   [`shipping-tax-and-mollie.md`](shipping-tax-and-mollie.md) naar de accountant;
4. geef daarna pas een afzonderlijke opdracht voor repositorycreatie en managed staging.
