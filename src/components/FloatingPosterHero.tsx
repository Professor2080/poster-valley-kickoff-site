import { ArrowDownRight } from 'lucide-react'
import { featuredDrop } from '../data/drops'
import { DropArtwork } from './DropArtwork'
import { PrintMeter } from './PrintMeter'

export function FloatingPosterHero() {
  const drop = featuredDrop

  return (
    <section id="top" className="hero-section section-pad relative isolate min-h-screen overflow-hidden pt-28">
      <div className="absolute inset-0 -z-20 bg-ink" />
      <div className="absolute right-[5%] top-[16%] -z-10 h-[38rem] w-[38rem] rounded-full bg-blue-haze/20 blur-[150px]" />
      <div className="absolute inset-x-6 top-28 -z-10 h-px bg-gradient-to-r from-transparent via-white/14 to-transparent" />

      <div className="mx-auto grid w-full max-w-[88rem] items-center gap-14 lg:grid-cols-[1fr_1fr]">
        <div className="max-w-4xl">
          <p className="eyebrow text-white/55">Curated drops · multiple creators</p>
          <h1 className="mt-6 max-w-4xl font-heading text-[clamp(3.5rem,6.4vw,7.5rem)] font-semibold leading-[0.86] tracking-[-0.075em] text-paper">
            Posters worth waiting for.
          </h1>
          <p className="hero-promise">Join the drop. Make it happen.</p>
          <p className="mt-6 max-w-xl text-lg leading-8 text-white/62">
            Discover Designs from different creators and help decide what appears in print. Every
            qualified reservation moves a drop closer to its First Edition.
          </p>
          <div className="mt-9 flex flex-col gap-4 sm:flex-row">
            <a className="button-primary" href="#drops">Explore live drops</a>
            <a className="button-secondary" href="#how-it-works">
              How drops work <ArrowDownRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className="hero-featured order-first lg:order-none">
          <a className="hero-featured-art" href={drop.href} aria-label={`View featured drop ${drop.title}`}>
            <DropArtwork drop={drop} priority />
          </a>
          <div className="hero-featured-caption">
            <div>
              <p>Featured · Drop {drop.number}</p>
              <h2>{drop.title}</h2>
              <span>by {drop.creator}</span>
            </div>
            {drop.progress ? <PrintMeter progress={drop.progress} /> : null}
            <a href={drop.href}>View featured drop</a>
          </div>
        </div>
      </div>
    </section>
  )
}
