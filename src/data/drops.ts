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
  creator: 'Manou',
  size: 'A2 (42 x 60 cm)',
  price: '€17,75',
  note: 'The first Poster Valley design is being prepared as a focused print release.',
  summary:
    'A dramatic aviation poster built around the Eurofighter Typhoon, prepared as Poster Valley\'s first focused drop.',
  dimensions: ['A2 (42 x 60 cm)', 'One fixed format for this first release'],
  printInfo: [
    'Geen betaling nu.',
    'Zodra de editie definitief is, zetten we je reservering om naar een pre-order met betaallink.',
    'Je reservering is specifiek voor deze poster.',
  ],
  shipping: [
    {
      region: 'Nederland',
      estimate: 'Indicatie €6,95',
      note: 'Thuisbezorgd als stevige posterzending.',
    },
    {
      region: 'Europa',
      estimate: 'Indicatie €13,95-€17,95',
      note: 'Afhankelijk van land en vervoerder.',
    },
    {
      region: 'Internationaal',
      estimate: 'Indicatie vanaf €24,95',
      note: 'Definitieve kosten worden bevestigd voor betaling.',
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
    title: 'Reserveer je poster',
    body: 'Laat per poster weten dat je een exemplaar wilt reserveren. Geen betaling nu, wel helderheid voor productie.',
  },
  {
    title: 'Ontvang de pre-order',
    body: 'Zodra de editie definitief is, sturen we printdetails, verzendkosten en een betaallink.',
  },
]
