import type { Drop } from '../data/drops'
import type { CSSProperties } from 'react'

type PosterFloatCardProps = {
  drop: Drop
  variant?: 'hero' | 'gallery' | 'ghost'
  className?: string
  style?: CSSProperties
}

export function PosterFloatCard({
  drop,
  variant = 'gallery',
  className = '',
  style,
}: PosterFloatCardProps) {
  const isGhost = variant === 'ghost' || !drop.image

  return (
    <a
      href={drop.href}
      className={`poster-card group block focus:outline-none ${className}`}
      style={style}
      aria-label={`View ${drop.title}`}
    >
      <span className="sr-only">{drop.note}</span>
      <span
        className={`relative block overflow-hidden border border-current/15 bg-paper ${
          variant === 'hero' ? 'shadow-poster' : 'shadow-object'
        }`}
      >
        {isGhost ? (
          <span className="placeholder-artwork flex aspect-[1190/1684] w-full flex-col justify-between p-5 text-ink">
            <span className="text-[0.65rem] uppercase tracking-[0.28em] text-ink/45">
              Poster Valley
            </span>
            <span>
              <span className="block h-px w-16 bg-ink/30" />
              <span className="mt-5 block font-heading text-3xl leading-none tracking-[-0.04em]">
                {drop.title}
              </span>
            </span>
            <span className="text-xs uppercase tracking-[0.24em] text-ink/45">{drop.status}</span>
          </span>
        ) : (
          <img
            src={drop.image}
            alt={drop.alt}
            width="1190"
            height="1684"
            className="aspect-[1190/1684] w-full object-cover"
            loading={variant === 'hero' ? 'eager' : 'lazy'}
          />
        )}
      </span>
      <span className="poster-caption mt-4 flex items-start justify-between gap-4 text-left">
        <span>
          <span className="block text-xs uppercase tracking-[0.22em] text-muted">{drop.status}</span>
          <span className="mt-1 block font-heading text-xl tracking-[-0.04em]">{drop.title}</span>
        </span>
        <span className="mt-1 text-xs uppercase tracking-[0.22em] text-muted">View</span>
      </span>
    </a>
  )
}
