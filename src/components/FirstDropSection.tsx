import { firstDrop } from '../data/drops'

export function FirstDropSection() {
  return (
    <section id="first-drop" className="section-pad bg-paper text-ink">
      <div className="mx-auto grid max-w-[82rem] gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <a
          href={firstDrop.pdf}
          className="group relative block focus:outline-none"
          aria-label={`Open PDF source for ${firstDrop.title}`}
        >
          <span className="absolute -inset-7 -z-10 rounded-[3rem] bg-blue-haze/10 blur-3xl" />
          <span className="block overflow-hidden border border-ink/12 bg-white p-3 shadow-poster transition duration-700 group-hover:-translate-y-2 group-hover:rotate-[-0.8deg] group-focus-visible:-translate-y-2 group-focus-visible:rotate-[-0.8deg]">
            <img
              src={firstDrop.image}
              alt={firstDrop.alt}
              width="1190"
              height="1684"
              className="aspect-[1190/1684] w-full object-cover"
              loading="lazy"
            />
          </span>
        </a>

        <div className="max-w-2xl lg:pl-8">
          <p className="eyebrow text-ink/45">Featured Design</p>
          <h2 className="mt-5 font-heading text-[clamp(3.7rem,8vw,7.5rem)] font-semibold leading-[0.86] tracking-[-0.08em]">
            {firstDrop.title}
          </h2>
          <div className="mt-7 flex flex-wrap gap-2">
            <span className="label-pill">First drop</span>
            <span className="label-pill">Coming soon</span>
            <span className="label-pill">Collecting interest</span>
          </div>
          <p className="mt-8 text-xl leading-9 text-ink/64">
            Our first poster drop is being prepared. Join the list to receive the launch date,
            edition details and print information first.
          </p>
          <p className="mt-5 text-sm leading-7 text-ink/48">
            Artist and production details are still to be announced. No price, edition size,
            material or release date is confirmed on this temporary site.
          </p>
          <div className="mt-9 flex flex-col gap-4 sm:flex-row">
            <a className="button-dark" href="#waitlist">
              Follow this drop
            </a>
            <a className="button-outline-dark" href={firstDrop.pdf}>
              View PDF source
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
