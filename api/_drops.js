export const serverDrops = [
  {
    id: 'drop_eurofighter_typhoon',
    slug: 'eurofighter-typhoon',
    title: 'Eurofighter Typhoon',
    creator: 'PosterValley',
    statusLabel: 'Preparing',
    editionLabel: 'First Edition',
    productType: 'poster',
    format: 'A2',
    dimensionsLabel: 'A2 (42 x 60 cm)',
    basePrice: 17.75,
    currency: 'EUR',
    priceLabel: '€17,75',
    shippingProfileId: 'protected-a2',
    shippingSummary:
      'Shipping is calculated when the poster goes into production. The final price including shipping is sent before payment.',
    reservationEnabled: true,
    orderMode: 'reservation-interest',
  },
]

export function getReservableDropBySlug(slug) {
  return serverDrops.find((drop) => drop.slug === slug && drop.reservationEnabled) ?? null
}
