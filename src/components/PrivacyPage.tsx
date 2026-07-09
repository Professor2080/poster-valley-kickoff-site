export function PrivacyPage() {
  return (
    <section className="section-pad min-h-screen bg-paper pt-32 text-ink">
      <div className="mx-auto max-w-[70rem]">
        <a
          className="text-xs uppercase tracking-[0.22em] text-ink/45 transition hover:text-ink focus-visible:text-ink"
          href="/"
        >
          Back to overview
        </a>
        <p className="eyebrow mt-10 text-ink/45">Privacy Notice</p>
        <h1 className="privacy-title mt-5 max-w-4xl">
          How we handle your details.
        </h1>
        <p className="mt-8 max-w-3xl text-xl leading-9 text-ink/62">
          This temporary Poster Valley kickoff site collects only the information needed to handle
          poster reservations and general release updates. We do not collect payment details or
          shipping addresses on this site.
        </p>

        <div className="mt-14 grid gap-8 border-t border-ink/12 pt-10 md:grid-cols-2">
          <PrivacyBlock
            title="Controller"
            body="Poster Valley is responsible for the processing described here. You can contact us at studio@postervalley.nl."
          />
          <PrivacyBlock
            title="What we collect"
            body="For poster reservations: first name, last name, email address, country, quantity, optional note, selected poster, source page and consent status. For general updates: email address, source page and newsletter consent status."
          />
          <PrivacyBlock
            title="Why we use it"
            body="We use reservation details to respond to your request, confirm print and shipping details, and send a payment link if the Edition moves to pre-order. We use newsletter details only to send general Poster Valley updates."
          />
          <PrivacyBlock
            title="Legal basis"
            body="Poster reservations are processed to take steps at your request before a possible order, and because you consent to being contacted about that poster. Newsletter updates are based on your consent."
          />
          <PrivacyBlock
            title="Processors"
            body="The site is hosted on Vercel and form submissions are stored in Supabase. These services process data for hosting, security and database storage."
          />
          <PrivacyBlock
            title="Retention"
            body="Reservation requests are kept for up to 24 months after the last contact, unless you ask us to delete them earlier or a later paid order requires a longer legal retention period. Newsletter subscriptions are kept until you unsubscribe or ask us to delete them."
          />
          <PrivacyBlock
            title="Your rights"
            body="You can ask to access, correct, delete, restrict or transfer your data. You can also object where applicable and withdraw consent for future updates at any time."
          />
          <PrivacyBlock
            title="Questions or complaints"
            body="Email studio@postervalley.nl for privacy questions or requests. You also have the right to contact the Dutch Data Protection Authority if you believe your data is not handled correctly."
          />
        </div>

        <div className="mt-12 rounded-[1.5rem] border border-ink/12 bg-white/55 p-6 text-sm leading-7 text-ink/56">
          Last updated: 8 July 2026. This notice is intended for the temporary kickoff site. Before
          public launch, the formal legal entity and final operational retention rules should be
          reviewed and completed.
        </div>
      </div>
    </section>
  )
}

function PrivacyBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-t border-ink/12 pt-5">
      <h2 className="font-heading text-3xl tracking-[-0.055em]">{title}</h2>
      <p className="mt-4 leading-7 text-ink/58">{body}</p>
    </div>
  )
}
