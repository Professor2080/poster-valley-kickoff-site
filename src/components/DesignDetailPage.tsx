import type { Drop } from '../data/drops'
import { getCreatorById, getOtherDropsForCreator, liveDrops } from '../data/drops'
import { DropArtwork } from './DropArtwork'
import { DropCard } from './DropCard'
import { DropInterestForm } from './DropInterestForm'
import { PrintMeter } from './PrintMeter'

export function DesignDetailPage({ drop }: { drop: Drop }) {
  const creator = getCreatorById(drop.creatorId)
  const creatorDrops = getOtherDropsForCreator(drop.creatorId, drop.id)
  const continueDrops = liveDrops.filter((item) => item.id !== drop.id).slice(0, 3)
  const action = getPrimaryAction(drop)

  return (
    <>
      <section id="drop-top" className="section-pad bg-paper pt-32 text-ink">
        <div className="mx-auto grid max-w-[88rem] gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:items-start">
          <div className="drop-detail-artwork lg:sticky lg:top-28">
            <div className="overflow-hidden border border-ink/12 bg-white p-3 shadow-poster">
              <DropArtwork drop={drop} priority />
            </div>
            {drop.prototypeNote ? <p>{drop.prototypeNote}</p> : null}
          </div>

          <div>
            <a className="detail-back-link" href="/#drops">Back to live drops</a>
            <div className="detail-kicker-row">
              <p className="eyebrow text-ink/45">Drop {drop.number}</p>
              <p>{drop.statusLabel}</p>
            </div>
            <h1 className="detail-title">{drop.title}</h1>
            <p className="detail-creator">by {drop.creator}{drop.isPrototype ? ' · prototype identity' : ''}</p>
            <p className="detail-summary">{drop.summary}</p>

            {drop.progress ? <div id="print-meter" className="detail-meter"><PrintMeter progress={drop.progress} tone="light" /></div> : null}

            <div className="detail-action-row">
              {action ? <a className="button-dark" href={action.href}>{action.label}</a> : null}
              <p>{action?.note ?? 'This Design has no primary purchase or reservation action in its current state.'}</p>
            </div>

            <dl className="detail-facts">
              <InfoBlock label="Status" value={drop.editionLabel} />
              <InfoBlock label="Creator" value={drop.creator} />
              <InfoBlock label="Size" value={drop.dimensions.display} />
              <InfoBlock label="Poster price" value={drop.priceLabel} />
            </dl>

            <div id="design-story" className="detail-story">
              <p className="eyebrow text-ink/42">Design story</p>
              <h2>A closer look at the idea.</h2>
              <p>{drop.story}</p>
              <blockquote>{drop.designThought}</blockquote>
            </div>

            <div className="detail-steps">
              <h2>How this drop works</h2>
              <ol>
                <li><span>01</span><div><strong>Join the drop</strong><p>A non-binding reservation of interest. No payment now.</p></div></li>
                <li><span>02</span><div><strong>Reach the target</strong><p>Qualified reserved copies move the Print Meter.</p></div></li>
                <li><span>03</span><div><strong>Confirm your order</strong><p>A personal invitation follows with final print, shipping and payment details.</p></div></li>
              </ol>
            </div>
          </div>
        </div>

        {drop.roomImage ? (
          <div className="room-view">
            <div>
              <p className="eyebrow text-ink/42">Room view</p>
              <h2>A real sense of scale.</h2>
              <p>
                The framed view shows how the {drop.dimensions.label} poster sits on a wall. The
                release is sold as a poster; frame styling is shown for context only.
              </p>
            </div>
            <div><img src={drop.roomImage} alt={`${drop.title} poster shown framed on a wall for scale`} width="640" height="480" loading="lazy" /></div>
          </div>
        ) : null}

        <div className="detail-practical">
          <div>
            <p className="eyebrow text-ink/42">Print and delivery</p>
            <h2>Clear before anything becomes final.</h2>
            <ul>{drop.detailBullets.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
          <div className="shipping-grid">
            {drop.shipping.map((zone) => (
              <div key={zone.region}><p>{zone.region}</p><strong>{zone.estimate}</strong><span>{zone.note}</span></div>
            ))}
            <p>{drop.shippingSummary}</p>
          </div>
        </div>

        {creator ? (
          <section className="creator-story" aria-labelledby="creator-title">
            <div className="creator-mark" aria-hidden="true">{creator.mark}</div>
            <div>
              <p className="eyebrow text-ink/42">About the creator</p>
              <h2 id="creator-title">{creator.name}</h2>
              {creator.isPrototype ? <p className="creator-prototype-note">Prototype identity · no real partnership is claimed.</p> : null}
            </div>
            <div>
              <p>{creator.story}</p>
              <p>{creator.designApproach}</p>
              {creatorDrops.length > 0 ? (
                <div className="creator-other-drops">
                  <span>Also in this prototype</span>
                  {creatorDrops.slice(0, 2).map((item) => <a key={item.id} href={item.href}>{item.title}</a>)}
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
      </section>

      <section className="continue-section section-pad bg-ink text-paper">
        <div className="mx-auto max-w-[88rem]">
          <p className="eyebrow text-white/45">Continue exploring</p>
          <h2>Other live drops on the wall.</h2>
          <div className="continue-grid">{continueDrops.map((item) => <DropCard key={item.id} drop={item} compact />)}</div>
        </div>
      </section>

      {drop.reservationEnabled ? (
        <section className="section-pad bg-ink text-paper"><div className="mx-auto max-w-[82rem]"><DropInterestForm drop={drop} /></div></section>
      ) : null}
    </>
  )
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>
}

function getPrimaryAction(drop: Drop) {
  if (drop.status === 'live') return { label: 'Join the drop', href: '#drop-interest', note: 'No payment now. Final details follow in a personal order invitation.' }
  if (drop.status === 'coming-next') return { label: 'Get notified', href: '/#waitlist', note: 'Participation is not open and no Print Meter is shown yet.' }
  if (drop.status === 'target-reached') return { label: 'View confirmed status', href: '#design-story', note: 'The First Edition target is shown as confirmed in this frontend fixture.' }
  if (drop.status === 'made-possible') return { label: 'View the story', href: '#design-story', note: 'This archive treatment is a visual fixture, not historical sales data.' }
  return null
}
