export type ShippingEstimate = {
  region: string
  estimate: string
  note: string
}

export type ShippingRate = {
  region: 'nl' | 'eu' | 'world'
  label: string
  amount: number
  amountLabel: string
  countries?: string[]
  note: string
}

export type ShippingProfile = {
  id: string
  label: string
  summary: string
  reviewNeeded: boolean
  packageClass: string
  weightGrams: number
  estimates: ShippingEstimate[]
  rates: ShippingRate[]
  unsupportedCountries: string[]
}

export type DropDimensions = {
  label: string
  widthCm: number
  heightCm: number
  display: string
}

export type Drop = {
  id: string
  slug: string
  title: string
  creator: string
  status: string
  statusLabel: string
  editionLabel: string
  productType: 'poster'
  productStatus: 'pre-production' | 'upcoming' | 'available'
  format: string
  dimensions: DropDimensions
  basePrice?: number
  currency: 'EUR'
  priceLabel: string
  shippingProfileId: string
  shippingSummary: string
  image: string
  roomImage?: string
  href: string
  alt: string
  isFirstDrop?: boolean
  reservationEnabled: boolean
  orderInvitationEnabled: boolean
  reservationCtaLabel: string
  orderMode: 'reservation-interest'
  note: string
  summary?: string
  detailBullets: string[]
  preOrderNotes: string[]
  shipping: ShippingEstimate[]
}

export const shippingProfiles = {
  protectedA2: {
    id: 'protected-a2',
    label: 'Protected A2 poster shipment',
    summary:
      'Shipping is calculated when the poster goes into production. The final price including shipping is sent before payment.',
    reviewNeeded: true,
    packageClass: 'a2-poster-tube',
    weightGrams: 350,
    estimates: [
      {
        region: 'The Netherlands',
        estimate: '€5,95',
        note: 'Delivered as a protected poster shipment.',
      },
      {
        region: 'Europe',
        estimate: 'From €9,50',
        note: 'Final cost depends on country and carrier.',
      },
      {
        region: 'International',
        estimate: 'From €21,00',
        note: 'Final cost is confirmed before payment.',
      },
    ],
    rates: [
      {
        region: 'nl',
        label: 'The Netherlands',
        amount: 5.95,
        amountLabel: '€5,95',
        countries: ['NL'],
        note: 'Protected poster shipment within The Netherlands.',
      },
      {
        region: 'eu',
        label: 'European Union',
        amount: 9.5,
        amountLabel: '€9,50',
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
        note: 'Protected poster shipment within the European Union.',
      },
      {
        region: 'world',
        label: 'Rest of world',
        amount: 21,
        amountLabel: '€21,00',
        note: 'Protected international poster shipment.',
      },
    ],
    unsupportedCountries: ['AQ', 'BV', 'HM', 'TF', 'UM'],
  },
} satisfies Record<string, ShippingProfile>

export const drops: Drop[] = [
  {
    id: 'drop_eurofighter_typhoon',
    slug: 'eurofighter-typhoon',
    title: 'Eurofighter Typhoon',
    creator: 'PosterValley',
    status: 'Preparing the First Edition',
    statusLabel: 'Preparing',
    editionLabel: 'First Edition',
    productType: 'poster',
    productStatus: 'pre-production',
    format: 'A2',
    dimensions: {
      label: 'A2',
      widthCm: 42,
      heightCm: 60,
      display: 'A2 (42 x 60 cm)',
    },
    basePrice: 17.75,
    currency: 'EUR',
    priceLabel: '€17,75',
    shippingProfileId: shippingProfiles.protectedA2.id,
    shippingSummary: shippingProfiles.protectedA2.summary,
    image: '/posters/first-drop-preview.webp',
    roomImage: '/posters/eurofighter-wall-frame.jpg',
    href: '/designs/eurofighter-typhoon',
    alt: 'Poster artwork for Eurofighter Typhoon',
    isFirstDrop: true,
    reservationEnabled: true,
    orderInvitationEnabled: true,
    reservationCtaLabel: 'Reserve your copy',
    orderMode: 'reservation-interest',
    note: 'The first Poster Valley design is being prepared as a focused print release.',
    summary:
      'A dramatic aviation poster built around the Eurofighter Typhoon, prepared as Poster Valley\'s first focused drop.',
    detailBullets: ['A2 (42 x 60 cm)', 'One fixed format for this first release'],
    preOrderNotes: [
      'No payment is taken now.',
      'If the Edition is confirmed, we send a personal order invitation.',
      'Address details and final shipping costs are only requested later.',
    ],
    shipping: shippingProfiles.protectedA2.estimates,
  },
]

export const featuredDrop = drops[0]
export const firstDrop = featuredDrop

export function getDropBySlug(slug: string) {
  return drops.find((drop) => drop.slug === slug)
}

export function getDropByHref(pathname: string) {
  return drops.find((drop) => drop.href === pathname)
}

export function getReservableDrops() {
  return drops.filter((drop) => drop.reservationEnabled)
}

export const upcomingDrops: Drop[] = [
  featuredDrop,
  {
    id: 'drop_second_study',
    slug: 'second-study',
    title: 'Second study',
    creator: 'PosterValley',
    status: 'Upcoming',
    statusLabel: 'Upcoming',
    editionLabel: 'Future Edition',
    productType: 'poster',
    productStatus: 'upcoming',
    format: 'TBC',
    dimensions: {
      label: 'TBC',
      widthCm: 0,
      heightCm: 0,
      display: 'Format to be confirmed',
    },
    currency: 'EUR',
    priceLabel: 'TBC',
    shippingProfileId: shippingProfiles.protectedA2.id,
    shippingSummary: shippingProfiles.protectedA2.summary,
    image: '',
    href: '#waitlist',
    alt: 'Abstract placeholder for an upcoming Poster Valley design',
    reservationEnabled: false,
    orderInvitationEnabled: false,
    reservationCtaLabel: 'Get updates',
    orderMode: 'reservation-interest',
    note: 'A quiet placeholder for the next curated poster study.',
    detailBullets: ['Format to be confirmed'],
    preOrderNotes: ['Join the update list for future releases.'],
    shipping: shippingProfiles.protectedA2.estimates,
  },
  {
    id: 'drop_third_study',
    slug: 'third-study',
    title: 'Third study',
    creator: 'PosterValley',
    status: 'Upcoming',
    statusLabel: 'Upcoming',
    editionLabel: 'Future Edition',
    productType: 'poster',
    productStatus: 'upcoming',
    format: 'TBC',
    dimensions: {
      label: 'TBC',
      widthCm: 0,
      heightCm: 0,
      display: 'Format to be confirmed',
    },
    currency: 'EUR',
    priceLabel: 'TBC',
    shippingProfileId: shippingProfiles.protectedA2.id,
    shippingSummary: shippingProfiles.protectedA2.summary,
    image: '',
    href: '#waitlist',
    alt: 'Abstract placeholder for a future Poster Valley design',
    reservationEnabled: false,
    orderInvitationEnabled: false,
    reservationCtaLabel: 'Get updates',
    orderMode: 'reservation-interest',
    note: 'Reserved for a future drop once the next design is selected.',
    detailBullets: ['Format to be confirmed'],
    preOrderNotes: ['Join the update list for future releases.'],
    shipping: shippingProfiles.protectedA2.estimates,
  },
]

export const processSteps = [
  {
    title: 'Discover a design',
    body: 'Poster Valley introduces upcoming poster designs one at a time, with enough space to actually look.',
  },
  {
    title: 'Reserve your poster',
    body: 'Reserve a copy for the specific poster you care about. No payment now, but clear production intent.',
  },
  {
    title: 'Receive the pre-order',
    body: 'Once the Edition is confirmed, we send a personal order invitation with final shipping and payment details.',
  },
]
