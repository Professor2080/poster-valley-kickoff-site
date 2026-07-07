import type { CSSProperties } from 'react'
import { upcomingDrops } from '../data/drops'
import { PosterFloatCard } from './PosterFloatCard'

type PosterGalleryStyle = CSSProperties & {
  '--poster-rotate'?: string
}

export function FeaturedDesigns() {
  return (
    <section id="designs" className="section-pad bg-ink text-paper">
      <div className="mx-auto max-w-[88rem]">
        <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <p className="eyebrow text-white/45">Designs</p>
            <h2 className="mt-5 font-heading text-[clamp(3.2rem,7vw,7rem)] font-semibold leading-[0.9] tracking-[-0.08em]">
              A small gallery before the first drop.
            </h2>
          </div>
          <p className="max-w-md text-lg leading-8 text-white/54">
            This is not a product grid. It is a preview room for Designs being considered,
            prepared, or followed.
          </p>
        </div>

        <div className="mt-16 grid gap-10 md:grid-cols-[1.1fr_0.75fr_0.9fr] md:items-start">
          <PosterFloatCard drop={upcomingDrops[0]} className="text-paper md:mt-16" />
          <PosterFloatCard
            drop={upcomingDrops[1]}
            variant="ghost"
            className="text-paper/85 md:-mt-4"
            style={{ '--poster-rotate': '2deg' } as PosterGalleryStyle}
          />
          <PosterFloatCard
            drop={upcomingDrops[2]}
            variant="ghost"
            className="text-paper/85 md:mt-28"
            style={{ '--poster-rotate': '-2deg' } as PosterGalleryStyle}
          />
        </div>
      </div>
    </section>
  )
}
