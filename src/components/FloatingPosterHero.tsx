import { ArrowDownRight } from 'lucide-react'
import { useRef } from 'react'
import type { CSSProperties, PointerEvent } from 'react'
import { firstDrop, upcomingDrops } from '../data/drops'
import { PosterFloatCard } from './PosterFloatCard'

type PosterMotionStyle = CSSProperties & {
  '--float-delay'?: string
  '--poster-rotate'?: string
}

export function FloatingPosterHero() {
  const heroRef = useRef<HTMLElement | null>(null)

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    const section = heroRef.current

    if (!section || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }

    const bounds = section.getBoundingClientRect()
    const x = (event.clientX - bounds.left) / bounds.width - 0.5
    const y = (event.clientY - bounds.top) / bounds.height - 0.5

    section.style.setProperty('--cursor-x', `${x * 16}px`)
    section.style.setProperty('--cursor-y', `${y * 14}px`)
    section.style.setProperty('--tilt-x', `${y * -1.4}deg`)
    section.style.setProperty('--tilt-y', `${x * 1.8}deg`)
  }

  return (
    <section
      id="top"
      ref={heroRef}
      onPointerMove={handlePointerMove}
      className="section-pad relative isolate flex min-h-screen items-center overflow-hidden pt-28"
    >
      <div className="absolute inset-0 -z-20 bg-ink" />
      <div className="absolute left-1/2 top-1/2 -z-10 h-[44rem] w-[44rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-haze/20 blur-[150px]" />
      <div className="absolute inset-x-6 top-28 -z-10 h-px bg-gradient-to-r from-transparent via-white/14 to-transparent" />

      <div className="mx-auto grid w-full max-w-[88rem] items-center gap-14 lg:grid-cols-[0.82fr_1.18fr]">
        <div className="max-w-4xl">
          <p className="eyebrow text-white/55">First drop in preparation</p>
          <h1 className="mt-6 max-w-4xl font-heading text-[clamp(4.8rem,11vw,10.8rem)] font-semibold leading-[0.82] tracking-[-0.085em] text-paper">
            Posters worth waiting for.
          </h1>
          <p className="mt-8 max-w-xl text-lg leading-8 text-white/62">
            Poster Valley curates poster designs and releases them as focused drops. Discover the
            first design, reserve a copy, or join the general update list for future releases.
          </p>
          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <a className="button-primary" href={`${firstDrop.href}#drop-interest`}>
              Reserveer deze poster
            </a>
            <a className="button-secondary" href="#waitlist">
              Ontvang updates
              <ArrowDownRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className="poster-stage relative order-first min-h-[37rem] w-full lg:order-none lg:min-h-[52rem]">
          <PosterFloatCard
            drop={firstDrop}
            variant="hero"
            className="floating-artwork main-poster absolute left-1/2 top-[45%] z-20 w-[min(78vw,21rem)] -translate-x-1/2 -translate-y-1/2 text-paper sm:w-[25rem] lg:w-[28rem]"
          />

          <PosterFloatCard
            drop={upcomingDrops[1]}
            variant="ghost"
            className="floating-artwork ghost-poster hidden text-paper/80 md:block md:absolute md:left-[5%] md:top-[18%] md:z-10 md:w-40 lg:w-48"
            style={{ '--float-delay': '900ms', '--poster-rotate': '-10deg' } as PosterMotionStyle}
          />
          <PosterFloatCard
            drop={upcomingDrops[2]}
            variant="ghost"
            className="floating-artwork ghost-poster hidden text-paper/80 md:block md:absolute md:bottom-[9%] md:right-[3%] md:z-10 md:w-44 lg:w-52"
            style={{ '--float-delay': '1500ms', '--poster-rotate': '9deg' } as PosterMotionStyle}
          />

          <a
            href={`${firstDrop.href}#drop-interest`}
            className="absolute bottom-8 left-0 right-0 mx-auto max-w-sm rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-center text-xs uppercase tracking-[0.24em] text-white/58 backdrop-blur transition hover:border-white/24 hover:text-paper focus:outline-none focus:ring-2 focus:ring-paper md:bottom-3"
          >
            Reserveer eerste poster
          </a>
        </div>
      </div>
    </section>
  )
}
