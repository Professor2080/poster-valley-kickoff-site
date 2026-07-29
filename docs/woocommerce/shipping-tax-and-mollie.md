# Verzending, btw, douane en Mollie-testplan

Onderzocht op **29 juli 2026**. Dit document is een technisch/operationeel voorstel en geen
fiscaal of juridisch advies. Een accountant bevestigt de btw-inrichting; een jurist/eigenaar
bevestigt consumenten-, retour- en privacyteksten vóór livegang.

## Aanbevolen verzendlancering

Start gefaseerd:

1. **NL** met geteste flat rates per verpakkingsklasse;
2. voeg alleen expliciet goedgekeurde EU-landen toe nadat tarief, levertijd, retourpad,
   btw/OSS en carrierdekking zijn bevestigd;
3. **blokkeer buiten-EU-checkout in WooCommerce v1**.

“EU” wordt niet als een brede restzone aangezet. Ieder toegestaan land staat expliciet in een
zone; uitzonderingsgebieden en eilanden worden tegen postcode-/carrierregels gecontroleerd.
Een onbedoelde rest-of-world-zone heeft geen shipping method, zodat checkout niet mogelijk is.

Buiten-EU-interesse mag contactinformatie opleveren voor een later businessbesluit, maar wordt
niet automatisch omgezet in een custom persoonlijke order. De bestaande handmatige
internationale beoordeling hoort bij de bestaande custom uitnodigingsflow; zij is geen
achterdeur voor Woo-voorraadverkoop.

## Zone- en tariefmodel

| Zone | Initiële status | Methode | Gate |
| --- | --- | --- | --- |
| Nederland | Launchkandidaat | Flat rate op `tube-s`, `tube-l` en alleen indien bewezen `flat-protected` | Drie packouts, offerte/actueel carriercontract, inclusief verpakkings- en toeslagberekening |
| België/Duitsland | Eerste EU-pilotkandidaten | Eigen flat rate(s), niet automatisch gelijk aan NL | Cross-border tarief, tracking/retour, btw/OSS en adresvalidatie bewezen |
| Overige gekozen EU-landen | Gefaseerd | Landgroep alleen als werkelijke kosten voldoende gelijk zijn; anders aparte zones | Carrierdekking, uitzonderingsgebieden, consumenteninfo en fiscale configuratie |
| Buiten EU | Uit voor v1 | Geen shipping method | Later ADR + douane-, tax-, DAP/DDP-, retour- en carrierproef |

WooCommerce core ondersteunt flat-ratekosten per order, item of shipping class:
[WooCommerce core shipping options](https://woocommerce.com/document/woocommerce-getting-started/shipping/core-shipping-options/).
Gebruik de formule pas nadat verpakking en combinatiegedrag zijn getest.

### Berekening van de klantprijs

De vastgestelde charge per zone/class omvat bewust:

- feitelijk carrier-/aggregatortarief;
- brandstof-, remote-area-, formaat- en piektoeslagen voor zover van toepassing;
- koker/doos, doppen, bescherming en label;
- een expliciet gekozen handlingmarge;
- de door de accountant bevestigde btw-behandeling.

Carrier cost en customer shipping charge zijn twee verschillende waarden en worden niet in
marketingtekst door elkaar gehaald. Ronding, gratis-verzenddrempel en bundelkorting zijn
businessbesluiten; zet ze niet stilzwijgend aan.

### Verpakkingsproef

Per shipping class:

1. pak minimaal drie representatieve orders in, inclusief een gemengde winkelmand;
2. meet buitenlengte, diameter/breedte/hoogte en totaalgewicht met gekalibreerde middelen;
3. voer drop-, buig-, vocht- en doptest uit en documenteer schadegrens;
4. controleer carriermaximum, volumetrisch gewicht en niet-standaardtoeslag;
5. test labelplaatsing, scanbaarheid, retouradres en tracking;
6. leg materiaal, leverancier, kostprijs en herbestelniveau vast.

Pas daarna krijgen echte producten maten, gewicht en shipping class.

## Carrier-/shippingplatformvergelijking

| Route | Sterk | Risico / beperking | Voorlopig gebruik |
| --- | --- | --- | --- |
| MyParcel + PostNL/partners | Laag-volume-/NL-focus, plugin gratis, labels/tracking en douaneondersteuning, betalen per zending | Externe order-/adresdata, afhankelijk van aggregator en plugin; actuele security-/HPOS-/Blocks-test nodig | **Voorkeursbake-off** voor NL-first |
| Sendcloud | Multi-carrier, servicepunten, retouren, bredere internationale groei | Abonnement/labelkosten voor meer functies, brede ordersync, jonge V2-plugin; enkele douanevelden niet gesynchroniseerd | Bake-off als multi-carrier/Europa launchvereiste is |
| Direct PostNL | Minder aggregatorlock-in, officiële Woo-route | Contract-/volumevoorwaarden, smaller carrierportfolio, internationale/retourfunctionaliteit vergelijken | Exit-/offertealternatief |
| Direct DHL/DPD/andere carrier | Mogelijk gunstig op gekozen lanes | Contract, minimumvolume, plugin, support en toeslagen nog onbekend | Alleen met actuele offerte en stagingbewijs |
| Handmatige carrierportal | Minste pluginoppervlak, bruikbaar bij zeer laag volume | Dubbele invoer, foutkans, tracking/e-mail handwerk, zwakker schaalbaar | Tijdelijke fallbackprocedure, nooit statusbron |

Kies één shippingplugin. De prijs- en pluginbronnen staan in
[`plugin-register.md`](plugin-register.md).

## Operationele fulfilmentregels

- Maak/exporteer geen label voor `pending`, `failed`, `cancelled`, `expired` of alleen
  `authorized`; alleen providerbevestigd `paid`/de geteste Woo-status mag de fulfilmentqueue in.
- De fulfilmentmedewerker vergelijkt item, aantal, verpakking en adres vóór labelaankoop.
- Tracking wordt teruggeschreven naar de Woo-order en via de geselecteerde Woo-e-mail verzonden.
- “Completed” betekent de vooraf gedefinieerde fysieke handoff, niet alleen “label gemaakt”.
- Mislukte export/pickup is idempotent: geen tweede label zonder controle van het eerste.
- Een adrescorrectie krijgt expliciete bevestiging/audit; deel het volledige adres niet in
  algemene logs of chat.
- Beschadiging/retour leidt pas na inspectie tot restock.

## Buiten EU: latere gate, niet v1

Voor een latere buiten-EU-pilot zijn minimaal nodig:

- [EORI-nummer](https://www.douane.nl/onderwerpen/invoer-en-uitvoer/nodig-bij-aangifte/eori-nummer/eori-nummer-aanvragen/)
  indien de douaneprocedure dit vereist;
- correcte HS-/goederencode, feitelijke omschrijving, land van oorsprong, aantal, netto/bruto
  gewicht en verkoopwaarde;
- juiste CN22/CN23 of digitale carrierdata en commerciële factuur waar vereist; PostNL legt
  de [douaneformulieren](https://www.postnl.nl/zakelijk/post-versturen/post-naar-het-buitenland/douaneformulier/)
  voor post buiten de EU uit;
- exportbewijs voor btw, gekoppeld aan de Woo-order en binnen de fiscale bewaartermijn;
- expliciete DAP/DDP-keuze en klanttekst over invoer-btw, invoerrechten en
  inklarings-/carrierkosten;
- ICS2-data waar van toepassing, verboden goederen, sancties/exportrestricties en
  land-/carrierdekking;
- haalbaar retourpad en behandeling van geweigerde/onbestelbare zendingen.

“Shipping” wordt niet gepresenteerd alsof invoer-btw, duties en inklaringskosten inbegrepen zijn
als dat niet aantoonbaar zo is.

## Btw- en fiscale beslispunten

### Technische uitgangspunten

- Toon consumentenprijzen volgens de bevestigde inclusief-btw-regels en laat shipping en totaal
  vóór orderbevestiging zien.
- Gebruik geen Woo tax class voordat de accountant de Nederlandse classificatie van deze
  posters en de btw op bijkomende verzendkosten heeft bevestigd.
- De Nederlandse Belastingdienst beschrijft voor intra-EU afstandsverkopen aan particulieren
  een gezamenlijke drempel van **EUR 10.000 exclusief btw** onder voorwaarden; boven de
  toepasselijke drempel geldt in beginsel btw van het bestemmingsland en kan OSS de aangifte
  centraliseren. Controleer de actuele situatie en omzet over relevante perioden:
  [Belastingdienst — goederen leveren aan particulieren in de EU](https://www.belastingdienst.nl/wps/wcm/connect/nl/btw/content/btw-goederen-eu-particulieren)
  en [EU One Stop Shop](https://europa.eu/youreurope/business/finance-and-tax/vat/one-stop-shop/index_nl.htm).
- Voor export buiten de EU kan 0% alleen onder de toepasselijke voorwaarden en met
  exportbewijs; zie
  [Belastingdienst — btw bij export](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/zakendoen_met_het_buitenland/zakendoen_buiten_de_eu/btw_berekenen/btw_berekenen_bij_export_van_goederen_naar_niet_eu_landen/).
- Invoer-btw/rechten bij de ontvanger zijn iets anders dan Nederlandse verkoop-btw en moeten
  apart in beleid en klanttekst staan.

### Vragen voor accountant/boekhouder

Laat schriftelijk beantwoorden:

1. Welke Nederlandse btw-classificatie en welk tarief geldt per posterproduct?
2. Welk tarief volgt de bijkomende verzend-/handlingcharge bij één of gemengde tax classes?
3. Voldoet Poster Valley aan de voorwaarden voor de EU-drempel; welke huidige/vorige
   jaaromzet telt mee en wanneer moet bestemmingsland-btw/OSS starten?
4. Welke landtarieven, locatiebewijzen en rapportages moeten Woo/Mollie bewaren?
5. Is de shop uitsluitend B2C of moet zakelijke EU-verkoop/VAT-ID-validatie worden ondersteund?
6. Welke factuur-, nummerreeks-, creditnota- en bewaareisen gelden; is een PDF-plugin nodig of
   volstaan Woo plus boekhoudpakket?
7. Hoe worden volledige/deelrefunds, shippingrefunds, kortingen en chargebacks per aangifteperiode
   verwerkt?
8. Hoe worden Mollie payouts/fees en carrier-/labelkosten gereconcilieerd?
9. Welk exportbewijs, EORI-/HS-codeproces en DAP/DDP-beleid is nodig voor een latere buiten-EU
   verkoop?
10. Heeft opslag/fulfilment in een ander land fiscale registratiegevolgen?

Pas na antwoorden wordt Woo taxconfiguratie in staging aangebracht en met rekenvoorbeelden
ondertekend.

## Juridische en privacy-gates

Vóór livegang moeten eigenaar/jurist de actuele winkelinformatie beoordelen: verkoper,
contact, prijzen/kosten, levering, klachten, wettelijke conformiteit, annulering/retour,
terugbetaling, privacy, cookies en voorwaarden. De EU geeft voor veel consumentenverkopen op
afstand onder meer een herroepingstermijn van 14 dagen, met uitzonderingen en
informatieplichten:
[Your Europe — online verkoop op afstand](https://europa.eu/youreurope/business/selling-in-eu/selling-goods-services/ecommerce-distance-selling/index_nl.htm).
Dit document bepaalt niet welke uitzondering op een concreet Poster Valley-product van
toepassing is.

De privacyinventaris omvat WordPress/host, Mollie, shippingprovider, mailprovider, analytics,
backups en supporttoegang. Verzamel telefoonnummer alleen als de carrier/bezorging het
aantoonbaar vereist. Zet niet-essentiële pixels en cookies standaard uit tot consentgrond en
tooling zijn besloten.

## Mollie-configuratie voor staging

Volg de officiële
[Mollie WooCommerce-startinstructie](https://docs.mollie.com/docs/woo-get-started) en
[test-and-go-live-gids](https://docs.mollie.com/docs/woo-test-and-go-live), maar stop vóór
go-live.

Precondities:

- geïsoleerde managed staging met Mollie-testprofiel/test-API-key;
- webhookroute bereikbaar via HTTPS ondanks algemene stagingafscherming;
- e-mailsink/suppressie bewezen;
- uitsluitend synthetische `.test`-klanten en geen echte shipments;
- exacte Woo-, Mollieplugin-, HPOS- en checkoutversies vastgelegd;
- debuglogging tijdelijk, minimaal en zonder secrets/volledige PII;
- iDEAL als minimale NL-methode; card en Bancontact alleen als launchscope dit vraagt;
- PayPal, Apple Pay en extra methoden uit tot ze een expliciete behoefte en eigen testmatrix
  hebben.

Mollie beschrijft dat testbetalingen statussen simuleren zonder echt geld en dat testwebhooks
wel worden verzonden:
[Mollie testing](https://docs.mollie.com/reference/testing).

## Mollie end-to-end testmatrix

| Scenario | Te bewijzen resultaat |
| --- | --- |
| Successful/`paid` | Orderbedrag, tax en shipping server-side correct; exact één overgang naar de fulfilmentstatus; stock correct verminderd; correcte klant-/adminmail in sink |
| `failed` | Geen fulfilment/label; duidelijke retry/nieuwe checkout; stock volgens geteste holdpolicy hersteld |
| `canceled` | Geen fulfilment/label; orderstatus en stock correct; geen “betaald”-mail |
| `expired` / onbetaalde timeout | Geen fulfilment; held stock na ingestelde termijn vrij; orderhistorie behouden |
| Redirect vóór webhook | Thank-you-pagina claimt niet voortijdig betaald; order blijft veilig pending |
| Webhook vóór/na redirect | Zelfde eindstatus; geen dubbele mail, stockmutatie of fulfilmentactie |
| Dubbele webhook/retry | Idempotent; maximaal één logische overgang |
| Vertraagde of out-of-order webhook | Laatste providerstatus wordt server-side opgehaald; geen downgrade/ongeautoriseerde fulfilment |
| Onbekend payment-ID / ongeldige request | Geen ordermutatie; veilig gelogd zonder secret/PII |
| API-/webhookstoring | Order blijft niet-fulfillable; monitoring en gecontroleerde reconciliatie werken |
| Volledige testrefund | Refund daadwerkelijk via Mollie testpad; Woo-bedragen/status/mail/reconciliatie kloppen; geen automatische restock zonder retourinspectie |
| Deelrefund incl./excl. shipping | Providerrefund en resterend orderbedrag/tax correct; expliciete restockkeuze |
| Alleen handmatig status “Refunded” | Bewijst juist dat dit géén Mollie-refund creëert en dus geen toegestaan financieel proces is |
| Cart/Checkout Blocks | Betaalvelden, validatie, terugkeer, shipping en accessibility werken met geselecteerde plugins |
| Classic checkout | Zelfde matrix; dient als ondersteunde fallback als plugincombinatie Blocks niet haalt |

De officiële [Mollie-webhookdocumentatie](https://docs.mollie.com/reference/webhooks) schrijft
voor dat de server op basis van het payment-ID de actuele providerstatus ophaalt; de browserredirect
is geen betaalbewijs. Webhooks worden herhaald bij fouten. De officiële
[WooCommerce order mapping](https://docs.mollie.com/docs/woo-manage-orders) koppelt onder meer
Woo “Processing” aan betaald en waarschuwt dat handmatig “Refunded” zetten geen refund bij
Mollie uitvoert.

## Stock-, mail- en fulfilmentsign-off

Voor ieder betalingsscenario wordt in één evidencetabel vastgelegd:

- payment-ID in geredigeerde vorm, Woo-order-ID en tijdlijn;
- ontvangen webhooks/retries en uiteindelijke providerstatus;
- Woo-status en stock vóór/tijdens/na;
- verzonden e-mailtype en aantal in de sink;
- label-/fulfilmentactie (moet leeg zijn tot `paid`);
- refund-ID/bedrag bij refundscenario;
- relevante PII-veilige logs en tester/sign-off.

Minimaal te beoordelen Woo-mails: new order aan shopbeheer, processing/paid aan klant,
completed/tracking, failed/cancelled waar geconfigureerd, refund volledig/deels en
wachtwoord/account alleen als accounts überhaupt worden gebruikt. Er mag geen dubbele of echte
mail ontstaan.

## Go-livegrens

Testmode afronden geeft **geen** toestemming om:

- een live Mollie-key in te voeren;
- een echte betaling/refund te starten;
- een echt label/pickup te kopen;
- e-mailsuppressie uit te zetten;
- productie-DNS, producten of stock te wijzigen.

Daarvoor is een apart productieplan met exacte omgeving, keys, bedragen, rollback en expliciete
toestemming nodig.
