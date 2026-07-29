# WooCommerce-shoparchitectuur

Laatst onderzocht: **29 juli 2026**. Dit document is een architectuurspike, geen
toestemming om hosting te kopen, WordPress te installeren, configuratie te wijzigen of een shop
te publiceren.

## Advies

Behoud `www.postervalley.nl` als de bestaande React/Vercel-site en plaats een native,
managed WordPress/WooCommerce-shop op **`shop.postervalley.nl`**. Een design in de
levenscyclus `in_stock` krijgt op de bestaande site een gewone link naar zijn WooCommerce-
productpagina. Bouw voor versie 1 geen reverse proxy en geen headless checkout.

Dit advies optimaliseert voor checkoutbetrouwbaarheid en beheer door een niet-ontwikkelaar. Het
is bovendien de kleinste operationele grens: als WooCommerce uitvalt, blijven de publieke
site, interesseformulieren en persoonlijke uitnodigingen onafhankelijk beschikbaar.

## Afbakening van eigenaarschap

| Gegeven of proces | Enige gezaghebbende systeem |
| --- | --- |
| Interesse en reserveringen | Bestaande custom app |
| Persoonlijke orderuitnodigingen en adressen daarvoor | Bestaande custom app |
| Custom Mollie-betalingen, custom verzendberekening en handmatige internationale beoordeling | Bestaande custom app |
| Custom fulfilment- en e-mailhistorie | Bestaande custom app |
| Voorraadproducten, SKU's, fysieke voorraad en prijzen bij `in_stock` | WooCommerce |
| Winkelmand, native checkout, winkelorders en refunds | WooCommerce |
| Verzending, fulfilmentstatus en operationele e-mails voor winkelorders | WooCommerce |
| Stabiele koppelsleutel | Exact dezelfde onveranderlijke `product_code`/Woo-SKU |

Prijs, voorraad, bestelling of betaling wordt niet in beide systemen bewerkbaar gemaakt.
`preorder` blijft uitsluitend de bestaande persoonlijke uitnodigingsflow; er komt geen
WooCommerce-preorderplugin. Alleen een door de betaalprovider bevestigde betaling mag
fulfilment vrijgeven.

## Vergelijking van de vier topologieën

Schaal: 1 is gunstig/laag, 5 is ongunstig/hoog. De scores zijn relatieve
architectuurinschattingen voor Poster Valley versie 1, geen hostbenchmark.

| Criterium | Managed Woo op `shop` | `/shop`-proxy | Headless Woo | Hele hoofdsite in WP/Woo |
| --- | ---: | ---: | ---: | ---: |
| Implementatiecomplexiteit | 2 | 4 | 5 | 4 |
| Doorlopend onderhoud | 2 | 4 | 5 | 3 |
| Security-/storingsoppervlak | 2 | 4 | 5 | 4 |
| Native checkoutbetrouwbaarheid | 1 | 3 | 4 | 1 |
| Niet-technisch beheer | 1 | 2 | 3 | 1 |
| Visuele aansluiting | 2 | 2 | 1 | 3 |
| Performance-risico | 2 | 4 | 3 | 3 |
| SEO-migratierisico | 2 | 3 | 3 | 5 |
| Verwachte vaste kosten | 2 | 4 | 4 | 3 |
| Platformlock-in | 2 | 3 | 4 | 4 |
| Toekomstige read-only integratie | 2 | 3 | 1 | 3 |

### 1. Managed WooCommerce op een subdomein — gekozen

Voordelen zijn een native WooCommerce-checkout, reguliere plugincompatibiliteit, eigen
staging/backupcyclus en een duidelijke blast radius. Nadelen zijn twee deployments, bewuste
merkconsistentie, afzonderlijke SEO-indexatie en een privacycontrole op cross-domain analytics.

### 2. WooCommerce achter `www.postervalley.nl/shop`

Een reverse proxy maakt de URL optisch één geheel, maar moet onder meer WordPress-cookies,
`wp-admin`, REST-routes, webhooks, uploads, redirects, permalinks en cache-invalidation goed
routeren. Dit vergroot zowel het foutoppervlak als de incidentdiagnose. Kinsta rekent momenteel
bijvoorbeeld **USD 50 per maand** voor zijn reverse-proxy-add-on; dit illustreert dat de proxy
een apart operationeel product is, niet alleen een DNS-keuze. Deze optie is pas heroverweegbaar
als een gekozen host de hele route aantoonbaar ondersteunt.

### 3. Headless WooCommerce

De officiële [Store API](https://developer.woocommerce.com/docs/apis/store-api/) kan producten,
winkelmand en checkout bedienen, maar de custom frontend wordt dan verantwoordelijk voor
cart tokens/nonces, sessies, checkoutstates, verzendselectie en compatibiliteit met betaal- en
verzendextensies. Dat verdubbelt precies het commercewerk dat WooCommerce hier moet
vereenvoudigen. Een latere read-only productfeed is wel passend; een headless checkout niet.

### 4. De hele hoofdsite vervangen door WordPress/WooCommerce

Deze route migreert content, SEO, design en de werkende custom dropflow zonder dat de
voorraadshop dat vereist. Bovendien vervaagt de noodzakelijke grens tussen preorder en
voorraadverkoop. Voor versie 1 is dit afgewezen.

## Navigatie en SEO

- Gebruik een duidelijke hoofdnavigatielink **Shop** naar `https://shop.postervalley.nl/` en
  een teruglink **Poster Valley / Designs** naar `https://www.postervalley.nl/`.
- Laat `shop` zijn eigen XML-sitemap en Search Console-property krijgen. Houd product-URL's
  stabiel en voorkom dunne of dubbele productteksten.
- De hoofdsite kan redactionele designinformatie tonen; WooCommerce bevat de transactionele
  productinformatie, actuele prijs en beschikbaarheid.
- Plaats `Product`/`Offer` structured data alleen waar het product direct koopbaar is. Google
  beschrijft merchant listings voor pagina's waarop de bezoeker daadwerkelijk kan kopen:
  [Google Product structured data](https://developers.google.com/search/docs/appearance/structured-data/product)
  en [merchant listings](https://developers.google.com/search/docs/appearance/structured-data/merchant-listing).
- Gebruik niet automatisch een canonical van een Woo-product naar de redactionele designpagina:
  de pagina's hebben een andere intentie. Beoordeel canonicals alleen bij werkelijk dubbele
  inhoud.

Een subdomein is hier geen SEO-snelkoppeling of gegarandeerde rankingstraf. De praktische
opgave is consistente interne links, unieke inhoud, stabiele URL's en afzonderlijke monitoring.

## Designrichting voor versie 1

Start met het officiële
[Storefront-thema](https://wordpress.org/themes/storefront/) en een kleine custom child theme
`poster-valley-shop`. Storefront heeft de kortste afstand tot WooCommerce en een child theme
houdt merkaanpassingen los van vendorupdates. Volg de officiële
[child-theme-opzet](https://developer.woocommerce.com/docs/theming/theme-development/set-up-a-child-theme).

De child theme vertaalt alleen het bestaande visuele systeem:

- `ink` `#080b0e`, `paper` `#f2eee7` en accent `blue-haze` `#365d8d`;
- Inter voor lopende tekst en Space Grotesk voor koppen;
- royale witruimte, posterachtige beeldkaders, pilvormige primaire acties;
- dezelfde globale header-/footerbenamingen, juridische links en focusstijlen;
- rustige productgrid en functionele winkelmand/checkout zonder checkout-“redesign”.

Vermijd in eerste instantie Woo-templatekopieën. Gebruik ondersteunde hooks, styles en block
settings; DOM-selectors en template-overrides maken updates broos. De gekozen betaal- en
verzendplugins bepalen in staging of Cart/Checkout Blocks of de classic checkout de veiligste
combinatie is. Beide worden getest; vormgeving bepaalt die keuze niet. Zie ook de officiële
[richtlijnen voor Cart en Checkout blocks](https://developer.woocommerce.com/docs/theming/block-theme-development/cart-and-checkout/).

## Integratielevenscyclus

### Naar `in_stock`

1. Tel de fysieke verkoopbare voorraad en handel open custom reserveringen/uitnodigingen af.
2. Maak in WooCommerce een conceptproduct met exact dezelfde SKU; publiceer het nog niet.
3. Controleer prijs, btw-klasse, verpakking, voorraad, checkout, betaal- en verzendpad in de
   daarvoor bedoelde omgeving.
4. Publiceer het Woo-product en controleer de definitieve HTTPS-URL.
5. Zet daarna, via een afzonderlijk goedgekeurde wijziging in de custom app, de registry in één
   beheerhandeling op `in_stock` met `woo_product_id` en `woo_product_url`.
6. Controleer dat de hoofdsite alleen naar Woo linkt en nergens een tweede kooproute aanbiedt.

De huidige databaseconstraint staat Woo-verwijzingen alleen bij `in_stock` toe. Het
`product_code` is al onveranderlijk. Deze spike wijzigt dat contract niet.

### Uitverkocht, storing en rollback

WooCommerce is bij voorraad nul de directe bron voor “uitverkocht”. Een nog niet gesynchroniseerde
hoofdsite-link mag hoogstens op de uitverkochte Woo-pagina landen; zij mag nooit een onjuiste
beschikbaarheid of alternatieve custom checkout beloven.

Versie 1 gebruikt een statische HTTPS-link en geen runtime-afhankelijkheid van een Woo-API. Bij
een storing blijven de hoofdsite en custom flows werken. Een beheerder kan na bevestiging de
shoplink tijdelijk verbergen en een neutrale melding tonen. Een storing activeert geen
preorder, creëert geen schaduworder en kopieert geen voorraad.

Een latere read-only integratie mag actuele productweergave cachen met time-out, circuit breaker
en “onbekend”-fallback. Browserwrites naar Woo of wederzijdse orderreplicatie blijven verboden.

## Security- en beheerbaseline

- Managed TLS, edge-WAF/DDoS-bescherming, dagelijkse backups, restoretest, staging en
  securityupdates zijn selectiepoorten voor hosting.
- Beperk plugins tot het register in `docs/woocommerce/plugin-register.md`; nieuwe plugins
  vereisen eigenaar, doel, persoonsgegevensanalyse en verwijderpad.
- Activeer HPOS en accepteer alleen extensies die daarmee zijn getest. HPOS is sinds WooCommerce
  8.2 standaard voor nieuwe installaties:
  [WooCommerce HPOS](https://developer.woocommerce.com/docs/features/high-performance-order-storage).
- Gebruik unieke accounts, 2FA, een password manager en least privilege. De ingebouwde
  [Shop Manager-rol](https://woocommerce.com/document/roles-capabilities/) heeft breder
  contentbeheer dan alleen fulfilment; maak vóór livegang een smallere fulfilmentrol als die
  scheiding operationeel nodig is.
- Houd secrets in host/environment secret storage, nooit in Git, frontendcode, URL's of logs.
- Houd staging afgeschermd/noindex, met synthetische `.test`-data, test-API-keys en een
  mailsink/suppressiepad.
- Volg de officiële
  [WordPress hardening](https://developer.wordpress.org/advanced-administration/security/) en
  [brute-forcebescherming](https://developer.wordpress.org/advanced-administration/security/brute-force/).

## Beslisstatus

De topologie is als richting geaccepteerd in ADR-004. Hosting, repositorycreatie, checkouttype,
shippingprovider, landen, tarieven, fiscale configuratie en livegang zijn nog expliciete
besluiten. De onderbouwing en gates staan in:

- `docs/woocommerce/hosting-and-staging.md`
- `docs/woocommerce/repository-and-operations.md`
- `docs/woocommerce/plugin-register.md`
- `docs/woocommerce/product-and-sku-model.md`
- `docs/woocommerce/shipping-tax-and-mollie.md`
- `docs/woocommerce/launch-roadmap.md`
