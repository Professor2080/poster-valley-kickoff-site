import { comingNextDrops, madePossibleDrops, unavailableDrops } from '../data/drops'
import { DropCard } from './DropCard'

export function DropStatusSections() {
  return (
    <section className="section-pad bg-ink text-paper">
      <div className="mx-auto max-w-[88rem]">
        <div className="status-section-grid">
          <div>
            <p className="eyebrow text-white/45">Coming next</p>
            <h2>Ideas worth watching.</h2>
            <p>Teasers carry a creator and a thought, never an empty product state or a false meter.</p>
          </div>
          {comingNextDrops.map((drop) => <DropCard key={drop.id} drop={drop} compact />)}
          {unavailableDrops.map((drop) => <DropCard key={drop.id} drop={drop} compact />)}
        </div>

        <div id="made-possible" className="made-possible">
          <div>
            <p className="eyebrow text-white/45">Made possible</p>
            <h2>Every completed drop becomes proof for the next.</h2>
            <p>
              A future archive for the Design, its creator and the people who helped move it into print.
              The fixture below is explicitly not historical sales data.
            </p>
          </div>
          {madePossibleDrops.map((drop) => <DropCard key={drop.id} drop={drop} compact />)}
        </div>
      </div>
    </section>
  )
}
