import { firstDrop } from '../data/drops'
import { DropInterestForm } from './DropInterestForm'

export function DesignDetailPage() {
  return (
    <>
      <section className="section-pad bg-paper pt-32 text-ink">
        <div className="mx-auto grid max-w-[88rem] gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div className="lg:sticky lg:top-28">
            <div className="overflow-hidden border border-ink/12 bg-white p-3 shadow-poster">
              <img
                src={firstDrop.image}
                alt={firstDrop.alt}
                width="1190"
                height="1684"
                className="aspect-[1190/1684] w-full object-cover"
              />
            </div>
          </div>

          <div>
            <a
              className="text-xs uppercase tracking-[0.22em] text-ink/45 transition hover:text-ink focus-visible:text-ink"
              href="/"
            >
              Back to overview
            </a>
            <p className="eyebrow mt-10 text-ink/45">Poster detail</p>
            <h1 className="mt-5 max-w-4xl font-heading text-[clamp(4rem,9vw,9rem)] font-semibold leading-[0.84] tracking-[-0.085em]">
              {firstDrop.title}
            </h1>
            <p className="mt-8 max-w-2xl text-xl leading-9 text-ink/64">{firstDrop.summary}</p>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
              <a className="button-dark" href="#drop-interest">
                Reserve your copy
              </a>
              <p className="max-w-sm text-sm leading-6 text-ink/48">
                No payment now. We confirm print details, shipping and payment before the pre-order
                becomes final.
              </p>
            </div>

            <div className="mt-9 grid gap-4 sm:grid-cols-2">
              <InfoBlock label="Status" value="Preparing" />
              <InfoBlock label="Creator" value={firstDrop.creator ?? 'Manou'} />
              <InfoBlock label="Size" value={firstDrop.size ?? 'A2 (42 x 60 cm)'} />
              <InfoBlock label="Price" value={firstDrop.price ?? '€17,75'} />
            </div>

            <div className="mt-12 grid gap-10 border-y border-ink/12 py-10 md:grid-cols-2">
              <div>
                <h2 className="font-heading text-3xl tracking-[-0.055em]">Poster details</h2>
                <ul className="mt-5 space-y-3 text-ink/58">
                  {firstDrop.dimensions?.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
              <div>
                <h2 className="font-heading text-3xl tracking-[-0.055em]">Before pre-order</h2>
                <ul className="mt-5 space-y-3 text-ink/58">
                  {firstDrop.printInfo?.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            </div>

            <div className="mt-10 border-b border-ink/12 pb-10">
              <h2 className="font-heading text-3xl tracking-[-0.055em]">Shipping indication</h2>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {firstDrop.shipping?.map((zone) => (
                  <div key={zone.region} className="border border-ink/12 bg-white/50 p-5">
                    <p className="text-xs uppercase tracking-[0.2em] text-ink/42">{zone.region}</p>
                    <p className="mt-3 font-heading text-2xl tracking-[-0.045em]">{zone.estimate}</p>
                    <p className="mt-3 text-sm leading-6 text-ink/52">{zone.note}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm leading-6 text-ink/45">
                Exact shipping costs are confirmed before we send a payment link.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section-pad bg-ink text-paper">
        <div className="mx-auto max-w-[82rem]">
          <DropInterestForm drop={firstDrop} />
        </div>
      </section>
    </>
  )
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-ink/14 pt-5">
      <p className="text-xs uppercase tracking-[0.22em] text-ink/42">{label}</p>
      <p className="mt-3 font-heading text-2xl tracking-[-0.055em]">{value}</p>
    </div>
  )
}
