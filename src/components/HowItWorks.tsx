import { processSteps } from '../data/drops'

export function HowItWorks() {
  return (
    <section id="how-it-works" className="section-pad bg-paper text-ink">
      <div className="mx-auto max-w-[82rem]">
        <div className="max-w-3xl">
          <p className="eyebrow text-ink/45">How it works</p>
          <h2 className="mt-5 font-heading text-[clamp(3rem,6vw,6rem)] font-semibold leading-[0.9] tracking-[-0.075em]">
            Follow the release before it becomes a shop.
          </h2>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {processSteps.map((step, index) => (
            <article key={step.title} className="border-t border-ink/14 pt-7">
              <p className="font-heading text-6xl tracking-[-0.08em] text-ink/18">
                {String(index + 1).padStart(2, '0')}
              </p>
              <h3 className="mt-8 font-heading text-3xl tracking-[-0.055em]">{step.title}</h3>
              <p className="mt-4 leading-7 text-ink/58">{step.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
