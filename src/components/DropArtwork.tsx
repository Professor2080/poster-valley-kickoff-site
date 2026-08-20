import type { CSSProperties } from 'react'
import type { Drop } from '../data/drops'

type ArtworkStyle = CSSProperties & { '--drop-accent': string }

export function DropArtwork({
  drop,
  priority = false,
  className = '',
}: {
  drop: Drop
  priority?: boolean
  className?: string
}) {
  if (drop.image) {
    return (
      <img
        src={drop.image}
        alt={drop.alt}
        width="1190"
        height="1684"
        loading={priority ? 'eager' : 'lazy'}
        className={`aspect-[1190/1684] h-full w-full object-cover ${className}`}
      />
    )
  }

  return (
    <div
      className={`prototype-artwork artwork-${drop.artworkStyle} aspect-[1190/1684] ${className}`}
      style={{ '--drop-accent': drop.accent } as ArtworkStyle}
      role="img"
      aria-label={drop.alt}
    >
      <span className="prototype-artwork-index">PV / {drop.number}</span>
      <span className="prototype-artwork-mark" aria-hidden="true" />
      <span className="prototype-artwork-title">{drop.title}</span>
      <span className="prototype-artwork-note">Prototype visual</span>
    </div>
  )
}
