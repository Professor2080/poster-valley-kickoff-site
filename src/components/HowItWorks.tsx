import { processSteps } from '../data/drops'

export function HowItWorks() {
  return (
    <section id="how-it-works" className="section-pad bg-paper text-ink">
      <div className="mx-auto max-w-[82rem]">
        <div className="max-w-4xl">
          <p className="eyebrow text-ink/45">How drops work</p>
          <h2 className="mt-5 font-heading text-[clamp(3rem,6vw,6rem)] font-semibold leading-[0.9] tracking-[-0.075em]">
            You help decide what gets printed.
          </h2>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-ink/58">
            Join the drop is a non-binding reservation of interest in the current flow. There is no
            payment now. If the target is reached, you receive a personal order invitation with the
            final print, shipping and payment details. If it is not reached, no payment takes place.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {processSteps.map((step, index) => (
            <article key={step.title} className="how-step border-t border-ink/14 pt-7">
              <p aria-hidden="true">{String(index + 1).padStart(2, '0')}</p>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
