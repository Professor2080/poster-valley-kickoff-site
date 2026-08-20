import { ArrowUpRight } from 'lucide-react'
import type { Drop } from '../data/drops'
import { DropArtwork } from './DropArtwork'
import { PrintMeter } from './PrintMeter'

export function DropCard({ drop, compact = false }: { drop: Drop; compact?: boolean }) {
  const showMeter = Boolean(drop.progress && (drop.status === 'live' || drop.status === 'target-reached'))

  return (
    <article className={`drop-card ${compact ? 'drop-card-compact' : ''}`}>
      <a className="drop-card-artwork group" href={drop.href} aria-label={`View ${drop.title}`}>
        <DropArtwork drop={drop} />
        {drop.isPrototype ? <span className="prototype-flag">Prototype concept</span> : null}
      </a>
      <div className="drop-card-body">
        <div className="drop-card-meta">
          <span>Drop {drop.number}</span>
          <span>{drop.statusLabel}</span>
        </div>
        <div className="drop-card-title-row">
          <div>
            <h3>{drop.title}</h3>
            <p>by {drop.creator}{drop.isPrototype ? ' · concept only' : ''}</p>
          </div>
          <a href={drop.href} aria-label={`Open ${drop.title}`}>
            <ArrowUpRight aria-hidden="true" />
          </a>
        </div>
        {!compact && showMeter && drop.progress ? <PrintMeter progress={drop.progress} tone="light" /> : null}
        {!compact && !showMeter ? <p className="drop-card-note">{statusCopy(drop)}</p> : null}
        <div className="drop-card-footer">
          <span>{drop.format}</span>
          <span>{drop.priceLabel}</span>
          {drop.status !== 'unavailable' ? <a href={drop.href}>{drop.reservationCtaLabel}</a> : null}
        </div>
      </div>
    </article>
  )
}

function statusCopy(drop: Drop) {
  if (drop.status === 'coming-next') return 'A considered teaser. Participation is not open yet.'
  if (drop.status === 'made-possible' && drop.progress) {
    return `Made possible after ${drop.progress.reservedCopies} copies were reserved. Prototype archive data.`
  }
  return 'This Design is visible without a misleading primary action.'
}
