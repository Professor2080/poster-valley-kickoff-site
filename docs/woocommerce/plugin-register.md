# WooCommerce-pluginregister

Onderzocht op **29 juli 2026**. Geen van deze plugins is in deze spike geïnstalleerd. Versies,
prijzen en compatibiliteit moeten bij staging en vóór iedere productie-update opnieuw worden
geverifieerd.

## Beslisregels

Elke plugin moet:

- één aantoonbare launchbehoefte oplossen die core WooCommerce of de host niet afdekt;
- een benoemde leverancier, operationeel eigenaar en verwijder-/exportpad hebben;
- actief onderhouden zijn en de gekozen WordPress-, Woo-, PHP-, HPOS- en checkoutversies
  ondersteunen;
- op staging worden getest op checkout, webhooks, persoonsgegevens, performance en rollback;
- zo min mogelijk externe order-/adresdata versturen;
- geen live keys, volledige persoonsgegevens of debuglogs naar onnodige derden sturen.

Een plugin die “handig” is maar geen launchgate oplost, wordt niet geïnstalleerd.

## Register

| Component | Status voor v1 | Leverancier / onderhoud | Publieke kosten | Belangrijkste risico's | Alternatief / exit |
| --- | --- | --- | --- | --- | --- |
| [WooCommerce](https://wordpress.org/plugins/woocommerce/) | **Verplicht** | Automattic; v10.9.4, bijgewerkt 7 juli 2026; 7+ miljoen installaties | Coreplugin gratis | Groot commerceoppervlak; update-/extensiecompatibiliteit; product-, order- en adresdata in WordPress | Geen Woo-winkel zonder core; volledige Woo-export en open source beperken lock-in |
| [Mollie Payments for WooCommerce](https://wordpress.org/plugins/mollie-payments-for-woocommerce/) | **Verplicht** | Mollie; v8.1.9, release 20 juli 2026; 100.000+ installaties | Plugin gratis; Mollie rekent per transactie, iDEAL publiek EUR 0,32 per geslaagde betaling | API-keys, betaalmetadata, webhook-/statusafhankelijkheid, regressie kan fulfilment blokkeren | Voor v1 geen tweede PSP-plugin; handmatige/directe custom integratie is juist buiten scope |
| [WooCommerce MyParcel](https://wordpress.org/plugins/woocommerce-myparcel/) | **Pilotkandidaat A; kies één shippingplugin** | MyParcel; v4.25.2, 25 juni 2026; 8.000+ installaties | Plugin gratis; betalen per zending/label volgens contract | Deelt order-/adres-/douanedata; label- en statusautomatisering; recente changelog bevat een securityfix voor ongeautoriseerde shipmentdatawijziging, dus alleen actuele versie; Blocks/HPOS end-to-end bewijzen | Handmatige carrierportal bij laag volume of directe PostNL-koppeling; exporteer tracking/labels vóór exit |
| [Sendcloud Connected Shipping](https://en-gb.wordpress.org/plugins/sendcloud-connected-shipping/) | **Pilotkandidaat B; kies één shippingplugin** | Sendcloud; v1.0.32, bijgewerkt juli 2026; 5.000+ installaties | Free EUR 0; publiek Lite EUR 35/mnd maandelijks of EUR 28/mnd jaarlijks plus labelkosten | Deelt order/adres/douanedata; externe ordersync; jonge V2-plugin en recente publieke support-/securitychurn vereisen extra review; eigen contractfuncties zitten in betaalde plannen | MyParcel, directe carrierplugin of handmatige portal; verwijder OAuth/API-toegang bij exit |
| [UpdraftPlus](https://wordpress.org/plugins/updraftplus/) | **Alleen bij host-backupgat** | UpdraftPlus; v1.26.6, 23 juli 2026; 3+ miljoen installaties | Free beschikbaar; premium niet begroot | Zeer hoge rechten en volledige database/PII naar externe opslag; credentials en restorecomplexiteit; dubbele backup kan vals vertrouwen geven | Voorkeur: hostbackup plus geteste export; alleen toevoegen na data-/restoreontwerp |
| [Wordfence Security](https://wordpress.org/plugins/wordfence/) | **Alleen bij host-securitygat** | Wordfence; v8.2.2, 13 mei 2026; 5+ miljoen installaties | Free; Premium publiek USD 149/jaar | PHP-resourcebelasting, IP-/securitytelemetrie en overlap/conflict met host-WAF; verkeerde blokkade kan checkout/webhook raken | Voorkeur: edge-WAF/DDoS, hostmalwareservice, 2FA en rate limits; eerst hostgate afdwingen |
| [PDF Invoices & Packing Slips for WooCommerce](https://wordpress.org/plugins/woocommerce-pdf-invoices-packing-slips/) | **Alleen na accountantsbesluit** | WP Overnight; v5.15.2, 13 juli 2026; 300.000+ installaties | Free basis; betaalde bundels vanaf circa EUR 99 op onderzoeksdatum | Extra kopieën van naam/adres/orderdata, documentnummering en creditnotelogica kunnen fiscaal gezaghebbend lijken; retentie/toegang | Woo-order/e-mail plus boekhoudpakket als dat voldoende blijkt |
| [Complianz](https://wordpress.org/plugins/complianz-gdpr/) | **Alleen bij niet-essentiële cookies** | Complianz B.V./Really Simple Plugins; v7.5.1, 27 juli 2026; 1+ miljoen installaties | Free; premiumprijs publiek rond USD 59/jaar voor één site | Scanner/scriptblocking en consentdata; kan cart, checkout of analytics breken; onderhoud van juridische teksten blijft mensenwerk | Geen bannerplugin als alleen strikt noodzakelijke checkoutcookies worden gezet en privacytekst klopt; anders minimal consentplatform |

“Bijgewerkt” en installatieaantallen komen van de WordPress.org-pagina op de
onderzoeksdatum en zijn geen kwaliteitsgarantie.

## Shippingplugin: gerichte bake-off

Selecteer **MyParcel óf Sendcloud**, nooit beide tegelijk in productie.

### MyParcel past beter als

- launchvolume laag is en Nederland/PostNL de kern vormt;
- geen maandelijks softwareabonnement gewenst is;
- eenvoudige labels, tracking en douanedocumenten voldoende zijn.

MyParcel noemt betalen per zending als model:
[MyParcel betaalopties](https://www.myparcel.nl/tarieven/betaalopties/). De publieke
[tarievenkaart 2026](https://www.myparcel.nl/app/uploads/myparcel-tarieven-2026-nl.pdf)
noemt bijvoorbeeld voor PostNL binnen Nederland EUR 7,45 standaard of EUR 7,20 in een
MyParcel-pakket, inclusief de op die kaart genoemde labelbijdrage. Dit zijn geen gegarandeerde
Poster Valley-tarieven.

### Sendcloud past beter als

- meerdere carriers, servicepunten, retouren en internationale groei launchvereisten zijn;
- het abonnement en de ordersync acceptabel zijn;
- de actuele V2-plugin de security-/compatibiliteitsreview doorstaat.

De publieke [Sendcloud-prijspagina](https://www.sendcloud.com/nl/prijzen/) toont onder meer
Free en Lite en indicatieve carrierprijzen. De officiële
[WooCommerce V2-functionaliteiten](https://support.sendcloud.com/hc/en-gb/articles/43560651699729-WooCommerce-V2-functionalities-overview)
tonen ook een relevante douanebeperking: HS-code, land van oorsprong en ICS2-data worden
ondersteund, maar factuurnummer en shipment type worden niet gesynchroniseerd. Die velden
moeten dus in de operationele douanecheck terugkomen.

### Directe carrier als exit

De officiële [PostNL WooCommerce-pluginroute](https://www.postnl.nl/zakelijk/pakket-versturen/it-koppelingen-webwinkels/plug-ins/woocommerce/)
kan later minder platformlock-in geven, maar vereist een vergelijking van contractvolume,
internationale dekking, support, retouren, servicepunten en tarieven. DHL/DPD worden alleen
via actuele offertes of de geselecteerde aggregator beoordeeld; er wordt nu geen carrierclaim
gedaan.

### Bake-offscenario's

Test in een wegwerpbare, geïsoleerde stagingkopie:

1. één synthetische betaalde NL-order en één expliciet toegestane EU-order;
2. eenvoudige en gecombineerde `tube-s`/`tube-l` winkelmand;
3. labelconcept zonder aankoop/pickup, trackingterugkoppeling en annulering;
4. HPOS plus Cart/Checkout Blocks én classic checkout waar de plugin die claimt;
5. geen export vóór providerbevestiging `paid`;
6. veldmapping met geminimaliseerd adres, telefoon alleen als carrier dit vereist;
7. logredactie, retries, rate limits, pluginuitschakeling en data-/tokenverwijdering;
8. voor een latere buiten-EU-proef: HS-code, oorsprong, gewicht, waarde, ICS2 en
   douanedocumentcontrole zonder echte zending.

## Plugins die bewust niet in de basis zitten

- **Geen preorder-/backorderplugin:** preorder blijft custom; Woo-backorders staan uit.
- **Geen extra SEO-plugin:** native Woo/schema en technisch goede content zijn voldoende voor
  de eerste circa tien producten; voeg pas toe bij een concrete ontbrekende functie.
- **Geen cacheplugin:** gebruik eerst hostcache/CDN met expliciete uitsluiting van cart,
  checkout, account en webhookroutes.
- **Geen SMTP-/marketingplugin:** stagingmail gaat naar sink/suppressie; operationele
  productiemail krijgt later een apart deliverabilitybesluit.
- **Geen page builder:** verhoogt lock-in en updateoppervlak; de kleine child theme volstaat.
- **Geen tweede payment- of shippingplugin als passieve fallback:** dubbele hooks en
  statemappings vergroten incidentrisico. Fallback is een gecontroleerd operationeel pad.

## Privacy- en securityreview per release

Leg per actieve plugin vast:

- verwerker/subverwerker, doel, categorieën persoonsgegevens, land en bewaartermijn;
- scopes/API-tokens, secretrotatie en webhookvalidatie;
- admincapabilities, REST-/AJAX-routes en publieke endpoints;
- logging/debugmode en redactie;
- laatste release/securityfix, supported versions en checksum/source;
- backup/export/verwijderpad en wat er bij de leverancier achterblijft.

De Nederlandse privacytoezichthouder beschrijft toestemming voor trackingcookies en het
onderscheid met functionele cookies in haar
[uitleg over cookiewalls](https://www.autoriteitpersoonsgegevens.nl/uploads/imported/normuitleg_ap_cookiewalls.pdf).
Of Poster Valley bij de uiteindelijke analyticsset een consenttool nodig heeft, wordt na een
feitelijke cookiescan besloten; een plugin maakt het gebruik niet automatisch rechtmatig.

## Open besluit

Voor provisioning beslist Pascal:

1. verwacht maandvolume en gewenste carriers/landen;
2. MyParcel-bake-off of Sendcloud-bake-off;
3. of hostbackup/security de twee conditionele plugins overbodig maakt;
4. of accountant een PDF-factuurplugin nodig vindt;
5. of niet-essentiële analytics/marketingcookies überhaupt in v1 nodig zijn.
