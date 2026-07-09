export const serverShippingProfiles = {
  protectedA2: {
    id: 'protected-a2',
    label: 'Protected A2 poster shipment',
    summary:
      'Shipping is calculated when the poster goes into production. The final price including shipping is sent before payment.',
    reviewNeeded: true,
    packageClass: 'a2-poster-tube',
    weightGrams: 350,
    rates: [
      {
        region: 'nl',
        label: 'The Netherlands',
        amount: 5.95,
        countries: ['NL'],
        note: 'Protected poster shipment within The Netherlands.',
      },
      {
        region: 'eu',
        label: 'European Union',
        amount: 9.5,
        countries: [
          'AT',
          'BE',
          'BG',
          'CY',
          'CZ',
          'DE',
          'DK',
          'EE',
          'ES',
          'FI',
          'FR',
          'GR',
          'HR',
          'HU',
          'IE',
          'IT',
          'LT',
          'LU',
          'LV',
          'MT',
          'PL',
          'PT',
          'RO',
          'SE',
          'SI',
          'SK',
        ],
        note: 'Review-needed example rate for EU shipments.',
      },
      {
        region: 'world',
        label: 'Rest of world',
        amount: 21,
        note: 'Review-needed example rate for non-EU shipments.',
      },
    ],
    unsupportedCountries: ['AQ', 'BV', 'HM', 'TF', 'UM'],
  },
}

export const serverDrops = [
  {
    id: 'drop_eurofighter_typhoon',
    slug: 'eurofighter-typhoon',
    title: 'Eurofighter Typhoon',
    creator: 'PosterValley',
    statusLabel: 'Preparing',
    editionLabel: 'First Edition',
    productType: 'poster',
    productStatus: 'pre-production',
    format: 'A2',
    dimensionsLabel: 'A2 (42 x 60 cm)',
    basePrice: 17.75,
    currency: 'EUR',
    priceLabel: 'EUR 17.75',
    shippingProfileId: serverShippingProfiles.protectedA2.id,
    shippingSummary: serverShippingProfiles.protectedA2.summary,
    reservationEnabled: true,
    orderInvitationEnabled: true,
    orderMode: 'reservation-interest',
  },
]

export function getReservableDropBySlug(slug) {
  return serverDrops.find((drop) => drop.slug === slug && drop.reservationEnabled) ?? null
}

export function getOrderableDropBySlug(slug) {
  return serverDrops.find((drop) => drop.slug === slug && drop.orderInvitationEnabled) ?? null
}

export function getShippingProfile(profileId) {
  return Object.values(serverShippingProfiles).find((profile) => profile.id === profileId) ?? null
}
