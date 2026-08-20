export type ShippingEstimate = {
  region: string
  estimate: string
  note: string
}

export type ShippingRate = {
  region: 'nl' | 'eu'
  label: string
  amount: number
  amountLabel: string
  countries?: string[]
  note: string
}

export type ManualShippingReview = {
  label: string
  message: string
  disabledAutomaticRate: number
  note: string
}

export type ShippingProfile = {
  id: string
  label: string
  summary: string
  reviewNeeded: boolean
  manualReview: ManualShippingReview
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

export type DropStatus =
  | 'live'
  | 'target-reached'
  | 'coming-next'
  | 'made-possible'
  | 'unavailable'

export type DropProgress = {
  reservedCopies: number
  target: number
}

export type Creator = {
  id: string
  name: string
  shortBio: string
  story: string
  designApproach: string
  mark: string
  isPrototype: boolean
}

export type Drop = {
  id: string
  number: string
  slug: string
  title: string
  creatorId: string
  creator: string
  status: DropStatus
  statusLabel: string
  editionLabel: string
  productType: 'poster'
  productStatus: 'pre-production' | 'upcoming' | 'available' | 'archived'
  format: string
  dimensions: DropDimensions
  basePrice?: number
  currency: 'EUR'
  priceLabel: string
  shippingProfileId: string
  shippingSummary: string
  image?: string
  roomImage?: string
  artworkStyle: 'image' | 'orbit' | 'grid' | 'field' | 'fold' | 'signal'
  accent: string
  href: string
  alt: string
  isFirstDrop?: boolean
  isPrototype: boolean
  prototypeNote?: string
  reservationEnabled: boolean
  orderInvitationEnabled: boolean
  reservationCtaLabel: string
  orderMode: 'reservation-interest'
  note: string
  summary: string
  story: string
  designThought: string
  progress?: DropProgress
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
    manualReview: {
      label: 'Outside the EU',
      message:
        "Shipping outside the EU is currently handled manually. Contact us and we'll confirm availability and shipping costs.",
      disabledAutomaticRate: 21,
      note: 'Rest-of-world automatic shipping can be re-enabled after business review.',
    },
    packageClass: 'a2-poster-tube',
    weightGrams: 350,
    estimates: [
      { region: 'The Netherlands', estimate: '€5,95', note: 'Delivered as a protected poster shipment.' },
      { region: 'Europe', estimate: 'From €9,50', note: 'Final cost depends on country and carrier.' },
      { region: 'International', estimate: 'Manual review', note: "Contact us and we'll confirm availability and shipping costs." },
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
        countries: ['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK'],
        note: 'Protected poster shipment within the European Union.',
      },
    ],
    unsupportedCountries: ['AQ', 'BV', 'HM', 'TF', 'UM'],
  },
} satisfies Record<string, ShippingProfile>

export const creators: Creator[] = [
  {
    id: 'poster-valley',
    name: 'Poster Valley',
    shortBio: 'A curated design publisher focused on memorable poster drops.',
    story: 'Poster Valley selects Designs that can hold a room without taking it over, then publishes them in carefully prepared Editions.',
    designApproach: 'Eurofighter Typhoon turns speed, atmosphere and engineered precision into one bold vertical composition.',
    mark: 'PV',
    isPrototype: false,
  },
  {
    id: 'prototype-creator-one',
    name: 'Prototype creator 01',
    shortBio: 'A clearly labelled placeholder identity for visual review only.',
    story: 'This creator profile is fixture copy. It demonstrates how a real creator biography could sit inside the curated Poster Valley experience.',
    designApproach: 'The concept explores quiet orbital forms, measured negative space and a single warm interruption.',
    mark: '01',
    isPrototype: true,
  },
  {
    id: 'prototype-creator-two',
    name: 'Prototype creator 02',
    shortBio: 'A clearly labelled placeholder identity for visual review only.',
    story: 'This profile is not a public creator claim. It exists to test hierarchy, biography length and links between multiple concept drops.',
    designApproach: 'The concept uses layered fields and soft directional lines to create movement without visual noise.',
    mark: '02',
    isPrototype: true,
  },
  {
    id: 'prototype-creator-three',
    name: 'Prototype creator 03',
    shortBio: 'A clearly labelled placeholder identity for visual review only.',
    story: 'This fixture lets the Preview show a third creator voice while staying explicit that no real collaboration or sales campaign exists.',
    designApproach: 'The concept combines a strict grid with one broken signal, balancing order and interruption.',
    mark: '03',
    isPrototype: true,
  },
]

const protectedA2 = shippingProfiles.protectedA2

export const drops: Drop[] = [
  {
    id: 'drop_eurofighter_typhoon', number: '001', slug: 'eurofighter-typhoon', title: 'Eurofighter Typhoon',
    creatorId: 'poster-valley', creator: 'Poster Valley', status: 'live', statusLabel: 'Live · preparing',
    editionLabel: 'First Edition', productType: 'poster', productStatus: 'pre-production', format: 'A2',
    dimensions: { label: 'A2', widthCm: 42, heightCm: 60, display: 'A2 (42 × 60 cm)' },
    basePrice: 17.75, currency: 'EUR', priceLabel: '€17,75', shippingProfileId: protectedA2.id,
    shippingSummary: protectedA2.summary, image: '/posters/first-drop-preview.webp',
    roomImage: '/posters/eurofighter-wall-frame.jpg', artworkStyle: 'image', accent: '#365d8d',
    href: '/designs/eurofighter-typhoon', alt: 'Eurofighter Typhoon poster Design in deep blue with a jet climbing through cloud',
    isFirstDrop: true, isPrototype: false, reservationEnabled: true, orderInvitationEnabled: true,
    reservationCtaLabel: 'Join the drop', orderMode: 'reservation-interest',
    note: 'The real first Poster Valley drop, shown separately from the prototype concepts.',
    summary: 'A dramatic aviation Design shaped by speed, atmosphere and the precise silhouette of the Eurofighter Typhoon.',
    story: 'The Design lets the aircraft arrive from a wide field of blue rather than treating it as a technical diagram. The large sky gives the movement room, while the quiet typography keeps the poster graphic and editorial.',
    designThought: 'Built to hold attention from across a room, then reveal its detail at poster distance.',
    progress: { reservedCopies: 3, target: 5 },
    detailBullets: ['A2 (42 × 60 cm)', 'One fixed format for this first release'],
    preOrderNotes: ['No payment is taken now.', 'If the Edition is confirmed, we send a personal order invitation.', 'Address details and final shipping costs are only requested later.'],
    shipping: protectedA2.estimates,
  },
  {
    id: 'drop_quiet_orbit', number: '002', slug: 'quiet-orbit', title: 'Quiet Orbit',
    creatorId: 'prototype-creator-one', creator: 'Prototype creator 01', status: 'live', statusLabel: 'Live · preparing',
    editionLabel: 'First Edition concept', productType: 'poster', productStatus: 'pre-production', format: '50 × 70',
    dimensions: { label: '50 × 70', widthCm: 50, heightCm: 70, display: '50 × 70 cm' },
    basePrice: 29, currency: 'EUR', priceLabel: 'Price concept · €29', shippingProfileId: protectedA2.id,
    shippingSummary: protectedA2.summary, artworkStyle: 'orbit', accent: '#c96f4a', href: '/designs/quiet-orbit',
    alt: 'Prototype abstract poster with orbital lines and a warm terracotta point', isPrototype: true,
    prototypeNote: 'Prototype fixture · no real creator partnership or sale', reservationEnabled: true,
    orderInvitationEnabled: false, reservationCtaLabel: 'Join the drop', orderMode: 'reservation-interest',
    note: 'A typography-and-shape fixture used only to review the multi-drop experience.',
    summary: 'A quiet study of orbit, distance and one warm point held in motion.',
    story: 'Quiet Orbit is a fictional prototype Design created with CSS shapes and type. It tests whether an abstract, restrained poster can carry its own drop story without implying a real collaboration.',
    designThought: 'A measured orbit should feel active without ever becoming loud.',
    progress: { reservedCopies: 6, target: 8 },
    detailBullets: ['Prototype format: 50 × 70 cm', 'Abstract visual generated in the frontend'],
    preOrderNotes: ['No payment is taken now.', 'No data leaves the browser in this prototype.', 'Final print, shipping and payment details would follow in a personal invitation.'],
    shipping: protectedA2.estimates,
  },
  {
    id: 'drop_open_field', number: '003', slug: 'open-field', title: 'Open Field',
    creatorId: 'prototype-creator-two', creator: 'Prototype creator 02', status: 'live', statusLabel: 'Live · preparing',
    editionLabel: 'First Edition concept', productType: 'poster', productStatus: 'pre-production', format: 'A2',
    dimensions: { label: 'A2', widthCm: 42, heightCm: 59.4, display: 'A2 (42 × 59.4 cm)' },
    basePrice: 24, currency: 'EUR', priceLabel: 'Price concept · €24', shippingProfileId: protectedA2.id,
    shippingSummary: protectedA2.summary, artworkStyle: 'field', accent: '#9fa993', href: '/designs/open-field',
    alt: 'Prototype abstract poster with layered green fields and fine directional lines', isPrototype: true,
    prototypeNote: 'Prototype fixture · no real creator partnership or sale', reservationEnabled: true,
    orderInvitationEnabled: false, reservationCtaLabel: 'Join the drop', orderMode: 'reservation-interest',
    note: 'A quiet abstract fixture for testing a second visual and creator voice.',
    summary: 'Layered green fields hold a soft line of movement from edge to edge.',
    story: 'Open Field is a fictional frontend fixture. Its broad horizontal movement tests how a quieter Design reads inside the same tall poster and editorial drop template.',
    designThought: 'A landscape can be suggested through rhythm rather than depicted literally.',
    progress: { reservedCopies: 2, target: 5 },
    detailBullets: ['Prototype format: A2', 'Abstract visual generated in the frontend'],
    preOrderNotes: ['No payment is taken now.', 'No data leaves the browser in this prototype.', 'This concept is not an announced commercial drop.'],
    shipping: protectedA2.estimates,
  },
  {
    id: 'drop_broken_signal', number: '004', slug: 'broken-signal', title: 'Broken Signal',
    creatorId: 'prototype-creator-three', creator: 'Prototype creator 03', status: 'target-reached', statusLabel: 'Target reached',
    editionLabel: 'First Edition confirmed', productType: 'poster', productStatus: 'pre-production', format: '50 × 70',
    dimensions: { label: '50 × 70', widthCm: 50, heightCm: 70, display: '50 × 70 cm' },
    basePrice: 27, currency: 'EUR', priceLabel: 'Price concept · €27', shippingProfileId: protectedA2.id,
    shippingSummary: protectedA2.summary, artworkStyle: 'grid', accent: '#d14d3f', href: '/designs/broken-signal',
    alt: 'Prototype black poster with a strict pale grid and one red broken signal', isPrototype: true,
    prototypeNote: 'Prototype status example · no production is scheduled', reservationEnabled: false,
    orderInvitationEnabled: false, reservationCtaLabel: 'View drop', orderMode: 'reservation-interest',
    note: 'A frontend-only example of a target-reached state.',
    summary: 'A strict grid interrupted once—enough to change the whole composition.',
    story: 'Broken Signal is a fictional status fixture. It demonstrates how a confirmed First Edition can move from conversion language into calm production information.',
    designThought: 'One controlled interruption can make order visible.',
    progress: { reservedCopies: 5, target: 5 },
    detailBullets: ['Prototype format: 50 × 70 cm', 'Target-reached state for visual review'],
    preOrderNotes: ['No new join action is available in this prototype state.'], shipping: protectedA2.estimates,
  },
  {
    id: 'drop_soft_fold', number: '005', slug: 'soft-fold', title: 'Soft Fold',
    creatorId: 'prototype-creator-two', creator: 'Prototype creator 02', status: 'coming-next', statusLabel: 'Coming next',
    editionLabel: 'In consideration', productType: 'poster', productStatus: 'upcoming', format: 'Format in review',
    dimensions: { label: 'TBC', widthCm: 0, heightCm: 0, display: 'Format in review' },
    currency: 'EUR', priceLabel: 'Price in review', shippingProfileId: protectedA2.id, shippingSummary: protectedA2.summary,
    artworkStyle: 'fold', accent: '#c6b7a3', href: '/designs/soft-fold',
    alt: 'Prototype warm-grey poster teaser with layered folded planes', isPrototype: true,
    prototypeNote: 'Prototype teaser · no participation is open', reservationEnabled: false,
    orderInvitationEnabled: false, reservationCtaLabel: 'Get notified', orderMode: 'reservation-interest',
    note: 'A coming-next fixture without a progress counter.',
    summary: 'A warm study of paper, shadow and one deliberate fold.',
    story: 'Soft Fold tests a coming-next story: enough visual and creator context to spark interest, without suggesting that participation or pricing is already available.',
    designThought: 'Paper becomes the subject before it becomes the material.',
    detailBullets: ['Prototype format still in review', 'No progress is shown before participation opens'],
    preOrderNotes: ['Notification is a local prototype interaction only.'], shipping: protectedA2.estimates,
  },
  {
    id: 'drop_afterlight', number: 'Archive 001', slug: 'afterlight', title: 'Afterlight',
    creatorId: 'poster-valley', creator: 'Poster Valley', status: 'made-possible', statusLabel: 'Made possible',
    editionLabel: 'First Edition story', productType: 'poster', productStatus: 'archived', format: 'A2',
    dimensions: { label: 'A2', widthCm: 42, heightCm: 59.4, display: 'A2 (42 × 59.4 cm)' },
    currency: 'EUR', priceLabel: 'Archive fixture', shippingProfileId: protectedA2.id, shippingSummary: protectedA2.summary,
    artworkStyle: 'signal', accent: '#d9a55e', href: '/designs/afterlight',
    alt: 'Prototype archive poster with a single amber line in a dark field', isPrototype: true,
    prototypeNote: 'Prototype archive story · not historical sales data', reservationEnabled: false,
    orderInvitationEnabled: false, reservationCtaLabel: 'View the story', orderMode: 'reservation-interest',
    note: 'A future-proof archive fixture for successful drop stories.',
    summary: 'A compact proof-state showing how completed drops can build trust for the next.',
    story: 'Afterlight is not a real historical campaign. It shows how Poster Valley can later preserve the Design, creator context and outcome of a successful drop without turning the archive into a sales grid.',
    designThought: 'The trace that remains can be more memorable than the event itself.',
    progress: { reservedCopies: 7, target: 5 },
    detailBullets: ['Prototype archive state', 'No active purchase or reservation action'],
    preOrderNotes: ['This page is a story and proof state only.'], shipping: protectedA2.estimates,
  },
  {
    id: 'drop_resting_form', number: '006', slug: 'resting-form', title: 'Resting Form',
    creatorId: 'prototype-creator-one', creator: 'Prototype creator 01', status: 'unavailable', statusLabel: 'Not available',
    editionLabel: 'On hold', productType: 'poster', productStatus: 'upcoming', format: 'Format in review',
    dimensions: { label: 'TBC', widthCm: 0, heightCm: 0, display: 'Format in review' },
    currency: 'EUR', priceLabel: 'Not available', shippingProfileId: protectedA2.id, shippingSummary: protectedA2.summary,
    artworkStyle: 'orbit', accent: '#77736d', href: '/designs/resting-form', alt: 'Muted prototype poster held as unavailable',
    isPrototype: true, prototypeNote: 'Prototype unavailable state · no CTA', reservationEnabled: false,
    orderInvitationEnabled: false, reservationCtaLabel: 'Not available', orderMode: 'reservation-interest',
    note: 'A quiet unavailable state with no misleading primary action.',
    summary: 'A held concept, kept visible without suggesting that participation is open.',
    story: 'Resting Form exists only to review how an unavailable Design can remain part of the curated record without looking broken or falsely actionable.',
    designThought: 'Sometimes the most trustworthy status is a quiet pause.',
    detailBullets: ['Prototype unavailable state', 'No participation or notification action'],
    preOrderNotes: ['No primary action is shown while the concept is on hold.'], shipping: protectedA2.estimates,
  },
]

export const featuredDrop = drops[0]
export const firstDrop = featuredDrop
export const upcomingDrops = drops
export const liveDrops = drops.filter((drop) => drop.status === 'live' || drop.status === 'target-reached')
export const comingNextDrops = drops.filter((drop) => drop.status === 'coming-next')
export const madePossibleDrops = drops.filter((drop) => drop.status === 'made-possible')
export const unavailableDrops = drops.filter((drop) => drop.status === 'unavailable')

export function getCreatorById(id: string) {
  return creators.find((creator) => creator.id === id)
}

export function getDropBySlug(slug: string) {
  return drops.find((drop) => drop.slug === slug)
}

export function getDropByHref(pathname: string) {
  return drops.find((drop) => drop.href === pathname)
}

export function getReservableDrops() {
  return drops.filter((drop) => drop.reservationEnabled)
}

export function getOtherDropsForCreator(creatorId: string, currentDropId: string) {
  return drops.filter((drop) => drop.creatorId === creatorId && drop.id !== currentDropId)
}

export const processSteps = [
  { title: 'Discover a Design', body: 'Explore carefully selected poster drops from different creators, each with its own story.' },
  { title: 'Join the drop — no payment yet', body: 'Reserve the number of copies you care about. It is a non-binding expression of interest.' },
  { title: 'Confirm when the target is reached', body: 'You receive a personal order invitation with final print, shipping and payment details.' },
]
