export type Drop = {
  slug: string
  title: string
  status: string
  image: string
  href: string
  alt: string
  isFirstDrop?: boolean
  creator?: string
  size?: string
  price?: string
  note: string
  summary?: string
  dimensions?: string[]
  printInfo?: string[]
  shipping?: {
    region: string
    estimate: string
    note: string
  }[]
}

export const firstDrop: Drop = {
  slug: 'eurofighter-typhoon',
  title: 'Eurofighter Typhoon',
  status: 'Preparing the First Edition',
  image: '/posters/first-drop-preview.webp',
  href: '/designs/eurofighter-typhoon',
  alt: 'Poster artwork for Eurofighter Typhoon',
  isFirstDrop: true,
  creator: 'PosterValley',
  size: 'A2 (42 x 60 cm)',
  price: '€17,75',
  note: 'The first Poster Valley design is being prepared as a focused print release.',
  summary:
    'A dramatic aviation poster built around the Eurofighter Typhoon, prepared as Poster Valley\'s first focused drop.',
  dimensions: ['A2 (42 x 60 cm)', 'One fixed format for this first release'],
  printInfo: [
    'No payment is taken now.',
    'When the Edition is confirmed, your reservation becomes a pre-order with a payment link.',
    'Your reservation is specific to this poster.',
  ],
  shipping: [
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
}

export const upcomingDrops: Drop[] = [
  firstDrop,
  {
    slug: 'second-study',
    title: 'Second study',
    status: 'Upcoming',
    image: '',
    href: '#waitlist',
    alt: 'Abstract placeholder for an upcoming Poster Valley design',
    note: 'A quiet placeholder for the next curated poster study.',
  },
  {
    slug: 'third-study',
    title: 'Third study',
    status: 'Upcoming',
    image: '',
    href: '#waitlist',
    alt: 'Abstract placeholder for a future Poster Valley design',
    note: 'Reserved for a future drop once the next design is selected.',
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
    body: 'Once the Edition is confirmed, we send print details, shipping costs and a payment link.',
  },
]
