import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { liveDrops } from '../data/drops'
import { DropCard } from './DropCard'

export function LiveDropsGallery() {
  const galleryRef = useRef<HTMLDivElement | null>(null)

  const move = (direction: -1 | 1) => {
    const gallery = galleryRef.current
    if (!gallery) return
    gallery.scrollBy({ left: direction * gallery.clientWidth * 0.82, behavior: 'smooth' })
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      move(-1)
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      move(1)
    }
  }

  return (
    <section id="drops" className="section-pad bg-paper text-ink">
      <div className="mx-auto max-w-[88rem]">
        <div className="drop-gallery-heading">
          <div>
            <p className="eyebrow text-ink/45">Live drops</p>
            <h2>Browse the wall. Choose what gets made.</h2>
          </div>
          <div className="drop-gallery-controls" aria-label="Live drops gallery controls">
            <button type="button" onClick={() => move(-1)} aria-label="Previous live drops">
              <ArrowLeft aria-hidden="true" />
            </button>
            <button type="button" onClick={() => move(1)} aria-label="Next live drops">
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
        </div>
        <p className="drop-gallery-intro">
          Each drop has its own Design, creator and target. The gallery uses prototype fixtures to show
          how Poster Valley can scale without becoming a marketplace.
        </p>
        <div
          ref={galleryRef}
          className="drop-gallery"
          tabIndex={0}
          role="region"
          aria-label="Live poster drops. Use left and right arrow keys to browse."
          onKeyDown={handleKeyDown}
        >
          {liveDrops.map((drop) => <DropCard key={drop.id} drop={drop} />)}
        </div>
      </div>
    </section>
  )
}
