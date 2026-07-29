# ADR-004: WooCommerce-topologie

**Status:** Accepted — uitvoering en productie vereisen afzonderlijke toestemming

**Besluitdatum:** 20 juli 2026

**Spike aangevuld:** 29 juli 2026

## Context

Poster Valley heeft al een publieke React/Vercel-site en een custom commerceflow voor
interesse, reserveringen, persoonlijke orderuitnodigingen, serverberekende verzending, Mollie
en fulfilment. Voor direct leverbare voorraadposters is een conventionele winkel nodig met
voorraadbeheer, winkelmand, checkout, refunds en operationeel beheer door een
niet-ontwikkelaar.

De architectuur moet voorkomen dat twee systemen tegelijk prijs, voorraad, betaling of orders
voor hetzelfde verkoopbare item bezitten.

## Besluit

Gebruik een native, managed WordPress/WooCommerce-installatie op
**`shop.postervalley.nl`**. Behoud de bestaande site op `www.postervalley.nl`. Wanneer een
product de levenscyclus `in_stock` bereikt, linkt de bestaande site naar de corresponderende
WooCommerce-productpagina.

Voor versie 1:

- blijft `interest`/`preorder` volledig custom;
- bezit WooCommerce uitsluitend `in_stock` commerce;
- is `product_code` exact gelijk aan de onveranderlijke Woo-SKU;
- is er geen order-, voorraad- of betaalstatusreplicatie;
- is er geen `/shop`-reverse proxy;
- is er geen headless winkelmand of checkout;
- wordt de hoofdsite niet naar WordPress gemigreerd.

## Overwogen alternatieven

### Reverse proxy onder `www.postervalley.nl/shop`

Afgewezen voor versie 1 vanwege routing van cookies, admin, media, permalinks, callbacks,
webhooks en caches over twee platformen. De korte URL weegt niet op tegen het extra
storings- en beveiligingsoppervlak.

### Headless WooCommerce

Afgewezen voor versie 1. Store API-sessies, nonces/cart tokens, checkoutstates en
plugincompatibiliteit zouden custom productcode worden. Een toekomstige, gecachete read-only
productweergave blijft mogelijk.

### Hele hoofdsite naar WordPress/WooCommerce

Afgewezen omdat dit een onnodige content-, SEO- en designmigratie veroorzaakt en de grens met
de custom dropflow verzwakt.

## Gevolgen

Positief:

- native checkout-, betaal-, verzend- en adminpaden blijven intact;
- de shop heeft een afzonderlijke blast radius en releasecyclus;
- een niet-ontwikkelaar kan voorraadorders in WooCommerce beheren;
- de custom app krijgt geen voorraad-, winkelmand- of refundfunctionaliteit.

Kosten en risico's:

- twee hosts/deployments en twee afzonderlijke operationele runbooks;
- visuele en navigatieconsistentie moet bewust worden onderhouden;
- cross-domain analytics/cookies en afzonderlijke SEO-monitoring moeten worden beoordeeld;
- handmatige, gecontroleerde levenscyclusovergang is versie 1; er is nog geen live statusfeed;
- WooCommerce-, plugin- en WordPress-updates vereisen staging en een restorebaar backupregime.

## Guardrails

- Alleen providerstatus `paid` mag fulfilment vrijgeven.
- Geen WooCommerce-preorderplugin en geen handmatige “markeer betaald”-route.
- Een Woo-storing mag nooit de custom checkout als stilzwijgende fallback activeren.
- Prijs, stock en Woo-orderinhoud blijven server-authoritatief in WooCommerce.
- Product- en klantgegevens worden niet tussen systemen gekopieerd zonder een later,
  afzonderlijk geaccepteerd datacontract.
- Staging gebruikt alleen synthetische data, testbetalingen en e-mailsuppressie.
- Hosting, DNS, repositorycreatie, credentials, staging, installatie en livegang vereisen ieder
  de passende afzonderlijke toestemming.

## Verificatie vóór implementatie

De volgende gates moeten allemaal groen zijn:

1. managed host voldoet aan staging-, backup/restore-, WAF-, update- en toegangsvereisten;
2. pluginmatrix ondersteunt de gekozen Woo-, WordPress-, PHP-, HPOS- en checkoutversies;
3. accountant bevestigt product-/verzend-btw, EU/OSS en factuur-/refundregels;
4. verpakte testzendingen leveren echte maten, gewichten, tarieven en douanegegevens;
5. Mollie-testmatrix toont correcte statussen, webhooks, refunds, stock en e-mails;
6. child theme voldoet op mobiel, toetsenbord, checkout en merkconsistentie;
7. operationeel eigenaar, incidentpad, restoretest en product-cutover/rollback zijn vastgelegd.

De uitgebreide afweging staat in
[`docs/architecture/woocommerce-shop.md`](../architecture/woocommerce-shop.md). De concrete
staging- en launchgates staan onder `docs/woocommerce/`.
