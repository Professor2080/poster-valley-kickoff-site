# Hosting- en stagingselectie

Onderzocht op **29 juli 2026**. Alle prijzen zijn indicatief, exclusief btw tenzij de leverancier
anders vermeldt, en zonder transacties, domein, externe e-mail of vervoerder. Introductiekorting
is geen structureel budget. Vraag vóór aankoop een offerte en laat alle open punten schriftelijk
bevestigen.

## Selectieadvies

Vraag een maand-/pilot-offerte aan bij **Cloud86**, **RAIDBOXES** en **Kinsta**. Gebruik
**Hosting.NL** als Nederlandse reservevergelijking. Selecteer niet alleen op teaserprijs:
restorebaarheid, resources voor checkout, security-eigenaarschap en snelle ondersteuning zijn
hardere gates.

De voorlopige voorkeur is:

1. **Cloud86 WooCommerce Start** als de pre-salescheck backupretentie/RPO, restoretest,
   WP-CLI en support-SLA bevestigt. De structurele lijstprijs van ongeveer EUR 19,95 per maand
   past bij een kleine launch.
2. **RAIDBOXES Pro** als vaste resources, EU/GDPR-positionering en extra managed beheer het
   hogere budget rechtvaardigen.
3. **Kinsta Single 20GB** als 24/7 support, volwassen tooling en herstelondersteuning de
   USD-prijs en internationale leverancier rechtvaardigen.

Geen leverancier is met deze deskresearch gekocht of technisch getest.

## Shortlist

| Host / passend plan | Publieke prijs op onderzoeksdatum | Bevestigde publieke kenmerken | Nog schriftelijk bevestigen |
| --- | --- | --- | --- |
| [Cloud86 WooCommerce Start](https://cloud86.io/nl/woocommerce-hosting/) | EUR 7,95/mnd bij 36 maanden of EUR 9,95/mnd bij 12 maanden; lijst/verlenging EUR 19,95/mnd | Nederlandse datacenterpositionering, SSL, WAF/anti-bot, SSH/Git, WordPress-toolkit, staging/clone, Redis/LiteSpeed, automatische updates; pagina noemt 10 PHP-workers | Exacte backupfrequentie en 7-daagse retentie zijn op de pagina niet eenduidig; RPO/RTO, offsite-scheiding, restore door klant/support, WP-CLI, support-SLA, PHP/Woo resourcegrenzen en exit/export |
| [RAIDBOXES Pro](https://raidboxes.io/wordpress-hosting-pricing/) | Regulier EUR 60/mnd; actuele tijdgebonden korting toonde EUR 48/mnd of EUR 43,20/mnd bij jaarbetaling | Eén site, staging, dagelijkse backups met 14 dagen retentie, 4 vCores, 8 GB RAM, 20 GB opslag; managed/GDPR-positionering | Nederlands/EU datacenter en DPA voor het concrete contract, WP-CLI/SSH/Git-rechten, support-SLA, Woo loadtestlimieten, malwareherstel, restore/RTO en export |
| [Kinsta Single 20GB](https://kinsta.com/pricing/) | USD 35/mnd of USD 350/jaar | Eén WordPress-installatie, 35.000 bezoeken, 10 GB opslag, 14 dagen backups, one-click staging, WAF/DDoS/botbescherming, SSL, malwareverwijdering en 24/7 support | Gewenste EU-locatie, btw/valuta, overagekosten, workers/concurrency voor checkout, DPA, concrete RTO; reverse proxy is niet nodig en kost publiek USD 50/mnd extra |
| [Hosting.NL Managed WooCommerce](https://hosting.nl/products/woocommerce/) | EUR 22/mnd bij 3 maanden, EUR 20/mnd bij 12 maanden of EUR 15/mnd bij 36 maanden | Eén site, SSL, backups, e-mail, staging en CDN worden publiek genoemd | Backupfrequentie/retentie/offsite, WAF/malwareherstel, WP-CLI/SSH/Git, resources/workers, support-SLA, datacenter/DPA en exit/export |

Kinsta documenteert voor staging expliciet
[SSH, WP-CLI en Git](https://kinsta.com/wordpress-hosting/staging/) en beschrijft
[dagelijkse backups en disaster recovery](https://kinsta.com/docs/wordpress-hosting/wordpress-backups/disaster-recovery/).
Voor de andere aanbieders zijn niet alle equivalente details op de onderzochte productpagina
hard genoeg bevestigd; daarom staan ze als pre-salesvragen en niet als aangenomen eigenschap.

## Harde acceptatiecriteria

Een host valt af als één van deze punten niet aantoonbaar is:

- ondersteunde actuele WordPress/WooCommerce/PHP-versies en minimaal 256 MB WordPress-memory;
- unieke productie- en stagingomgevingen met gescheiden database, uploads, secrets en cache;
- TLS, WAF/DDoS- en brute-forcebescherming vóór WordPress;
- dagelijkse geautomatiseerde backup met ten minste 14 dagen retentie of een gemotiveerd
  equivalent, plus exporteerbare backup en een herstelpad dat daadwerkelijk kan worden getest;
- database- en bestandenrestore naar staging zonder productie te overschrijven;
- monitoring van uptime, PHP errors, resource-uitputting en certificaten;
- automatische securitypatches met controleerbaar onderhoudsvenster en rollback;
- SSH en bij voorkeur WP-CLI/Git of een even reproduceerbaar deploymentpad;
- EU-locatie/DPA en lijst van subverwerkers passend bij order- en adresgegevens;
- support die checkoutincidenten kan escaleren, met responstijden op papier;
- volledige export van database, uploads en configuratie bij vertrek;
- geen verplichte hostplugin die checkout, Mollie-webhooks of het geselecteerde shippingpad
  oncontroleerbaar wijzigt.

De officiële WooCommerce-baseline noemt onder meer PHP 7.4+ (8 aanbevolen), HTTPS en 256 MB
WordPress-memory; de gekozen combinatie moet op de aankoopdatum opnieuw tegen de actuele
[WooCommerce server requirements](https://woocommerce.com/document/server-requirements/)
worden gecontroleerd.

## Pre-salesvragen

Stuur elke kandidaat exact dezelfde vragen:

1. Welke vCPU/CPU-, RAM-, PHP-worker-, database- en I/O-limieten gelden voor plan en staging?
2. Wat zijn backupfrequentie, retentie, opslaglocatie, encryptie, RPO en realistische RTO?
3. Kunnen wij zelf een point-in-time of geselecteerde database+uploads naar staging herstellen?
4. Is een begeleide restoretest vóór launch inbegrepen en wat gebeurt er bij malware?
5. Zijn SSH, WP-CLI, Git/deploy hooks, cron en toegang tot relevante PHP/Woo-logs beschikbaar?
6. Hoe worden WordPress/core/pluginupdates getest, uitgesteld en teruggedraaid?
7. Ondersteunt de WAF Mollie-webhooks en callbacks zonder brede bypass?
8. Welke datacenterlocatie, verwerkersovereenkomst en subverwerkers gelden voor de concrete site?
9. Welke overages, renewalprijzen, contractduur, opzegtermijn en migratie-/exitkosten gelden?
10. Kan support een checkoutincident 24/7 behandelen en wat is de responstijd per ernst?

## Stagingontwerp

Gebruik eerst de afgeschermde, door de host aangemaakte staging-URL. Alleen als stabiele
callbacks dat vereisen, wordt na apart DNS-besluit
`staging-shop.postervalley.nl` gebruikt.

Staging voldoet aan alle volgende regels:

- aparte database, uploads, adminaccounts en secrets; nooit een live databaseverbinding;
- `noindex` plus toegangsbeperking, waarbij alleen de minimaal vereiste Mollie-webhookroute
  publiek bereikbaar is;
- uitsluitend synthetische klanten en adressen op gereserveerde `.test`-domeinen;
- Mollie-**test**key en testmode; geen live betaalcredential;
- e-mail gaat naar een mailsink of wordt aantoonbaar onderdrukt; nooit naar echte klanten;
- shippinglabels worden niet gekocht en er wordt geen echte pickup geboekt;
- productie-analytics, pixels, feeds en zoekmachine-indexatie staan uit;
- logs bevatten geen API-keys, volledige adressen of onnodige betaalmetadata;
- dezelfde Woo-, theme- en pluginversies als de beoogde productiecombinatie;
- HPOS en het gekozen checkouttype worden expliciet vastgelegd en getest;
- refresh van productie naar staging is vóór launch verboden; een latere procedure moet
  persoonsgegevens sanitiseren en apart worden geaccordeerd.

## Backup- en restoreproef

“Backup aanwezig” is onvoldoende. Vóór livegang:

1. maak een synthetisch product, order en afbeelding in staging;
2. neem of selecteer de normale geautomatiseerde backup;
3. wijzig/verwijder alleen die synthetische fixtures;
4. herstel naar een geïsoleerde stagingkopie;
5. controleer database, uploads, permalink, adminlogin, pluginversies en checkout;
6. meet RPO/RTO, leg uitvoerder en supportstappen vast en verwijder de fixtures;
7. exporteer een versleutelde, herstelbare kopie volgens het overeengekomen retentiebeleid.

De test mag nooit productie of echte klantdata gebruiken.

## Indicatief budget

Voor hosting is een realistische structurele bandbreedte **circa EUR 20–60 per maand exclusief
btw** (Kinsta in USD), vóór carrier-, payment- en optionele plugin-/mailkosten. WooCommerce,
Mollie Payments en de onderzochte basisplugins hebben een gratis pluginvariant. Mollie en
vervoerders rekenen per transactie/zending; Sendcloud kan daarnaast abonnement-/labelkosten
hebben. Reserveer los budget voor juridische/fiscale controle, designimplementatie,
restoreproef en operationele tijd.

## Selectiepoort

Pascal kiest pas na antwoorden/offertes:

- maximaal structureel maandbudget en geaccepteerde contractduur;
- gewenste support-/herstelklasse;
- EU/Nederlandse datalocatie-eis;
- primaire host en één exit-alternatief.

Daarna is een nieuw, afzonderlijk akkoord nodig om een hostcontract of stagingomgeving te
maken.
