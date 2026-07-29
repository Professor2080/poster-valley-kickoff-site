# Product-, SKU- en voorraadmodel

## Kernbesluit

Ieder afzonderlijk verkoopbaar fysiek posterformaat is in versie 1 een **eenvoudig
WooCommerce-product** met één onveranderlijke SKU. Die SKU is exact gelijk aan de bestaande
`product_code`, bijvoorbeeld:

```text
eurofighter-typhoon-a2
```

Een titel, maker of URL mag later wijzigen; de koppelsleutel niet. Als hetzelfde design in A2
en A1 wordt verkocht, zijn dat twee fysieke items met twee SKU's, bijvoorbeeld
`eurofighter-typhoon-a2` en `eurofighter-typhoon-a1`. Variabele producten zijn pas zinvol als
het assortiment groter wordt; ook dan moet iedere verkoopbare variatie een unieke SKU houden.

## Naamgevingscontract

Formaat: `{design-slug}-{fysiek-formaat}`.

- alleen kleine ASCII-letters, cijfers en enkele koppeltekens;
- betekenisvol en stabiel, zonder prijs, jaartal, voorraadstatus of marketingtekst;
- fysieke variant in de code als voorraad, verpakking of prijs verschilt;
- geen hergebruik nadat een product is gearchiveerd;
- geen afkortingen die zonder register dubbelzinnig zijn;
- toekenning gebeurt één keer na controle op de custom registry én WooCommerce.

De huidige custom registry dwingt patroon
`^[a-z0-9]+(?:-[a-z0-9]+)*$` af, maakt `product_code` onveranderlijk en leidt de
commerceautoriteit af van `lifecycle_mode`. Deze spike wijzigt dat databasecontract niet.

## Productvelden

| Veld | Bron bij `in_stock` | Regel |
| --- | --- | --- |
| SKU / `product_code` | Gedeeld identiteitscontract | Onveranderlijk; exact gelijk in beide systemen |
| Producttitel | WooCommerce | Klantvriendelijk; wijzigbaar zonder SKU-wijziging |
| Designnaam en maker | WooCommerce productmetadata/attribute | Geen sleutel; gebruik **design**, niet artwork, in klanttekst |
| Formaat | WooCommerce attribute | Bijvoorbeeld A2; fysieke printmaat ook in cm vastleggen |
| Materiaal/druk | WooCommerce productmetadata | Alleen feitelijk gecontroleerde specificaties |
| Afbeeldingen en alttekst | WooCommerce media | Geoptimaliseerde webkopieën; geen drukbronbestanden; rechten bevestigd |
| Prijs en sale price | WooCommerce | Server-authoritatief; inclusief-btw-weergave na accountantsconfiguratie |
| Tax class | WooCommerce | Pas na fiscale bevestiging; niet gokken op hoog/laag tarief |
| Stock quantity/status | WooCommerce | Fysieke verkoopbare telling; `manage_stock` aan |
| Backorders | WooCommerce | Uit voor v1; geen verkoop van niet-bestaande voorraad |
| Low-stock threshold | WooCommerce | Besluit per SKU/operationeel volume |
| Gewicht en productmaten | WooCommerce | Werkelijk gemeten en gedocumenteerd |
| Shipping class | WooCommerce | Gebaseerd op geteste verpakking, bijvoorbeeld `tube-s`/`tube-l` |
| Publicatiestatus | WooCommerce | Concept tot alle launchgates groen zijn |
| Woo product-ID en HTTPS-URL | Custom registry, alleen bij `in_stock` | Read-only koppeling; geen prijs/stockkopie |

## Voorraadregels zonder nepvoorraad

- Tel alleen fysiek aanwezige, verkoopbare exemplaren; beschadigde, sample- en gereserveerde
  exemplaren staan apart.
- Leg voor de eerste import per SKU vast: telling, datum, teller en bewijs/locatie. Voer pas
  daarna de Woo-quantity in.
- `manage_stock` staat aan, backorders uit en out-of-stock visibility wordt bewust gekozen.
- Stock wordt door Woo gereserveerd/verminderd volgens de geteste orderstatusconfiguratie.
  Timeout van onbetaalde orders en stock restoration moeten in de betaalmatrix bewezen zijn.
- Een refund zet voorraad niet automatisch terug zonder fysieke retourontvangst en inspectie.
  Restock is een expliciete fulfilmenthandeling met auditspoor.
- Geen “oneindig”, geschat of marketingmatig verlaagd aantal; geen fake scarcity.
- Geen tweede spreadsheet of custom admin waar medewerkers dezelfde Woo-voorraad aanpassen.
  Een telling/export is controlemateriaal, niet de bron.

## Cataloguswerkblad voor ongeveer tien producten

De negen lege regels hieronder zijn **planningsslots**, geen producten, SKU's of voorraad.
Ze mogen niet worden geïmporteerd of gepubliceerd. Dit voorkomt dat de spike verzonnen
assortiment of schaarste creëert.

| Slot | Bevestigde `product_code` | Titel/maker | Formaat | Verkoopbare telling | Verpakking | Prijs/tax class | Status |
| ---: | --- | --- | --- | ---: | --- | --- | --- |
| 1 | `eurofighter-typhoon-a2` | Eurofighter Typhoon / maker te bevestigen | A2 | Te tellen | Te testen | Te besluiten | Bestaand `interest`; niet in Woo gepubliceerd |
| 2 | Niet toegekend | Te kiezen | Te kiezen | Niet geteld | Te testen | Te besluiten | Geen product |
| 3 | Niet toegekend | Te kiezen | Te kiezen | Niet geteld | Te testen | Te besluiten | Geen product |
| 4 | Niet toegekend | Te kiezen | Te kiezen | Niet geteld | Te testen | Te besluiten | Geen product |
| 5 | Niet toegekend | Te kiezen | Te kiezen | Niet geteld | Te testen | Te besluiten | Geen product |
| 6 | Niet toegekend | Te kiezen | Te kiezen | Niet geteld | Te testen | Te besluiten | Geen product |
| 7 | Niet toegekend | Te kiezen | Te kiezen | Niet geteld | Te testen | Te besluiten | Geen product |
| 8 | Niet toegekend | Te kiezen | Te kiezen | Niet geteld | Te testen | Te besluiten | Geen product |
| 9 | Niet toegekend | Te kiezen | Te kiezen | Niet geteld | Te testen | Te besluiten | Geen product |
| 10 | Niet toegekend | Te kiezen | Te kiezen | Niet geteld | Te testen | Te besluiten | Geen product |

Pascal/eigenaar levert vóór de staging-import per echt product:

- goedgekeurde designnaam, maker/credit en rechten;
- uniek fysiek formaat, werkelijke maten/gewicht en materiaal;
- geoptimaliseerde beelden, alttekst en producttekst;
- getelde voorraad en voorraadlocatie;
- prijs, bevestigde tax class en lage-voorraaddrempel;
- geteste shipping class/verpakking;
- retour-/beschadigingsregels en publicatievolgorde.

## Shipping classes

Classificeer op het **verpakte pakket**, niet alleen op papierformaat:

- `tube-s`: kleinere geteste posterkoker, exacte binnen-/buitenmaat en maxgewicht nog te meten;
- `tube-l`: grotere geteste posterkoker met eigen carrier-/toeslagprofiel;
- `flat-protected`: alleen als een fysieke drop-/buig-/vochttest laat zien dat vlak verzenden
  verantwoord is.

Gebruik geen verzonnen afmetingen in stagingconfiguratie. Pak minimaal drie representatieve
orders in, meet koker/doos, totaalgewicht en dode ruimte, en controleer carrierlimieten en
toeslagen.

## Levenscyclus en cutover

| Mode | Commerceautoriteit | Gedrag |
| --- | --- | --- |
| `interest` | Custom | Interesse/reservering; geen koop en geen Woo-link |
| `preorder` | Custom | Persoonlijke uitnodiging; custom prijs, betaling en fulfilment |
| `in_stock` | WooCommerce | Woo bezit prijs, stock, cart, checkout, order, refund en fulfilment |
| `sold_out` | Geen nieuwe commerce | Historische informatie; geen kooproute |
| `archived` | Historisch | Geen nieuwe commerce |

Cutover van een SKU naar `in_stock`:

1. blokkeer geen lopende custom order stilzwijgend; inventariseer open reserveringen,
   uitnodigingen, betalingen en fulfilment;
2. maak een Woo-concept met dezelfde SKU en getelde stock;
3. valideer product, tax, shipping, checkout, Mollie en e-mails in de bedoelde omgeving;
4. bepaal een kort cutovervenster en wijs één uitvoerder aan;
5. publiceer Woo en controleer URL/koopbaarheid;
6. laat de custom registry in een afzonderlijk goedgekeurde handeling atomair naar `in_stock`
   met Woo-ID/URL gaan;
7. controleer dat slechts één kooproute zichtbaar en werkzaam is.

Er wordt geen Woo-productreferentie vooraf opgeslagen: de bestaande databaseconstraint staat
die alleen toe bij `in_stock`.

## Orders, annuleringen en refunds

- De Woo-order is de volledige bron voor winkelorderregels, adres, bedragen, tax, shipping,
  payment reference, refund en fulfilment.
- De custom app ontvangt of bewaart geen Woo-orderkopie in v1.
- Pending/failed/cancelled/expired geeft nooit vrij voor fulfilment.
- Een refund gebeurt via Woo/Mollie volgens het geteste providerpad. Alleen een Woo-status
  handmatig op “Refunded” zetten is geen financiële refund.
- Een retour wordt pas restocked na ontvangst en verkoopbaarheidsinspectie.
- Correcties krijgen een reden en auditspoor; overschrijf geen orderhistorie om een rapport
  passend te maken.

## Latere read-only integratie

Als de statische link te beperkt wordt, mag een apart ADR een gecachete read-only feed
overwegen met uitsluitend:

- `product_code`, publieke product-URL, titel, thumbnail en coarse availability;
- korte time-out, circuit breaker en laatste-bekende/onbekend-status;
- geen klant/orderdata en geen browser- of serverwrites naar voorraad/prijzen;
- Woo blijft de bron; cachedata mag nooit een betaalbare custom route creëren.

Daarvoor is nu geen API, webhook, schema of secret toegevoegd.
