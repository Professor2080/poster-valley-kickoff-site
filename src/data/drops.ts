export type Drop = {
  slug: string
  title: string
  status: string
  image: string
  pdf?: string
  href: string
  alt: string
  isFirstDrop?: boolean
  note: string
  summary?: string
  dimensions?: string[]
  printInfo?: string[]
}

export const firstDrop: Drop = {
  slug: 'eurofighter-typhoon',
  title: 'Eurofighter Typhoon',
  status: 'First drop - coming soon',
  image: '/posters/first-drop-preview.webp',
  pdf: '/posters/first-drop.pdf',
  href: '/designs/eurofighter-typhoon',
  alt: 'Poster artwork for Eurofighter Typhoon',
  isFirstDrop: true,
  note: 'The first Poster Valley design is being prepared as a focused print release.',
  summary:
    'A dramatic aviation poster built around the Eurofighter Typhoon, prepared as Poster Valley\'s first focused drop.',
  dimensions: ['A2 source artwork', 'Additional print sizes to be confirmed'],
  printInfo: [
    'No payment is taken with this form.',
    'Final price, paper, edition details and shipping timing will be confirmed before payment.',
    'Your interest request is specific to this poster.',
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
    title: 'Follow the drop',
    body: 'Join the list for the Designs you care about. No fake urgency, no noisy launch mechanics.',
  },
  {
    title: 'Get notified',
    body: 'Launch date, print details and availability are shared when the release is ready.',
  },
]
