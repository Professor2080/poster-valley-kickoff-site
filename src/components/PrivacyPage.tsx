import { legalDetails } from '../data/legal'
import { routes } from '../lib/routes'

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
        <h1 className="privacy-title mt-5 max-w-4xl">How we handle your details.</h1>
        <p className="mt-8 max-w-3xl text-xl leading-9 text-ink/62">
          This temporary Poster Valley kickoff site collects only the information needed to handle
          poster reservations, personal order invitations and general release updates. Initial
          reservations stay lightweight; shipping details are only requested later on a personal
          order page.
        </p>

        <div className="mt-14 grid gap-8 border-t border-ink/12 pt-10 md:grid-cols-2">
          <PrivacyBlock
            title="Controller"
            body={`Poster Valley is part of ${legalDetails.sellerName} (${legalDetails.englishName}), the legal entity responsible for this site and your personal data. Registered address: ${legalDetails.addressLines.join(', ')}. Chamber of Commerce: ${legalDetails.chamberOfCommerce}. VAT number: ${legalDetails.vatNumber}. Contact: ${legalDetails.email}.`}
          />
          <PrivacyBlock
            title="What we collect"
            body="For poster reservations we collect first name, last name, email address, country, requested quantity, optional note, selected poster or drop, source page, reservation consent and optional future-drop update preference."
          />
          <PrivacyBlock
            title="Personal order invitations"
            body="If a reserved poster moves toward production, we may send a personal order invitation. On that page we collect shipping name, country, street address, postal code, city, optional region and terms acceptance before starting payment."
          />
          <PrivacyBlock
            title="Why we use it"
            body="We use reservation details to follow up on the specific poster, estimate production interest, send production updates and prepare personal order invitations. We use order details to calculate shipping, create the payment, confirm the order and prepare fulfilment."
          />
          <PrivacyBlock
            title="General updates"
            body="The general update form at the bottom of the homepage is separate from poster reservations. If you join it, we use your email address to send occasional Poster Valley release updates."
          />
          <PrivacyBlock
            title="Processors"
            body="The site is hosted on Vercel, reservation and order details are stored in Supabase, emails may be sent through Resend, and payments are handled by Mollie Checkout. We do not store card or bank details ourselves."
          />
          <PrivacyBlock
            title="Terms"
            body="The personal order page links to the temporary order terms before payment. Those terms explain when a reservation becomes a paid order and how shipping or production issues are handled."
          />
          <PrivacyBlock
            title="Retention"
            body="Reservation requests are kept for up to 24 months after the last contact, unless you ask us to delete them earlier or a later paid order requires a longer legal retention period. Paid order and payment status records may be kept for legal, tax and fulfilment administration. Newsletter subscriptions are kept until you unsubscribe or ask us to delete them."
          />
          <PrivacyBlock
            title="Your rights"
            body="You can ask to access, correct, delete, restrict or transfer your data. You can also object where applicable and withdraw consent for future updates at any time."
          />
          <PrivacyBlock
            title="Questions or complaints"
            body={`Email ${legalDetails.email} for privacy questions or requests. You also have the right to contact the Dutch Data Protection Authority if you believe your data is not handled correctly.`}
          />
        </div>

        <div className="mt-12 rounded-[1.5rem] border border-ink/12 bg-white/55 p-6 text-sm leading-7 text-ink/56">
          Last updated: 18 July 2026. This notice is intended for the temporary kickoff site. Before
          broader public launch, final operational retention rules should be reviewed and completed.
          Read the{' '}
          <a className="underline underline-offset-4 transition hover:text-ink" href={routes.terms}>
            Terms
          </a>{' '}
          for the temporary order and cancellation wording.
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
