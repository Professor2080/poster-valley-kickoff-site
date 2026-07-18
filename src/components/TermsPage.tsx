import { legalDetails } from '../data/legal'
import { routes } from '../lib/routes'

export function TermsPage() {
  return (
    <section className="section-pad min-h-screen bg-paper pt-32 text-ink">
      <div className="mx-auto max-w-[70rem]">
        <a
          className="text-xs uppercase tracking-[0.22em] text-ink/45 transition hover:text-ink focus-visible:text-ink"
          href={routes.home}
        >
          Back to overview
        </a>
        <p className="eyebrow mt-10 text-ink/45">Terms</p>
        <h1 className="privacy-title mt-5 max-w-4xl">Order terms for the kickoff site.</h1>
        <p className="mt-8 max-w-3xl text-xl leading-9 text-ink/62">
          These terms describe the temporary Poster Valley kickoff flow. They are written for the
          first limited production decision and should be reviewed before broader public sales.
        </p>

        <div className="mt-14 grid gap-8 border-t border-ink/12 pt-10 md:grid-cols-2">
          <TermsBlock
            title="Seller"
            body={`Poster Valley is part of ${legalDetails.sellerName} (${legalDetails.englishName}). The seller and legal entity is ${legalDetails.sellerName}, registered at ${legalDetails.addressLines.join(', ')}. Chamber of Commerce: ${legalDetails.chamberOfCommerce}. VAT number: ${legalDetails.vatNumber}. Contact: ${legalDetails.email}.`}
          />
          <TermsBlock
            title="Personal invitations"
            body="Poster Valley order invitations are personal links. They are intended for the recipient and may expire or be cancelled if the Edition is no longer available."
          />
          <TermsBlock
            title="Reservation versus order"
            body="A reservation is an expression of interest, not an order and not a payment. An order or pre-order is confirmed only after you review the poster price, shipping and total, accept these terms and complete payment."
          />
          <TermsBlock
            id="payment-terms"
            title="Currency and payment terms"
            body="All prices and payments are in EUR. Before payment, the order page shows the poster price, shipping and total. Prices include VAT where applicable. Payment through Mollie Checkout confirms the order or pre-order."
          />
          <TermsBlock
            id="shipping-and-returns"
            title="Shipping and returns"
            body="Automatic shipping quotes are currently available for the Netherlands and supported European Union destinations. Shipping outside the EU is handled by manual review: contact us before ordering so we can confirm availability and shipping costs. To request a cancellation, withdrawal or return after payment, email studio@postervalley.nl as soon as possible. We will confirm the available next steps based on the order and fulfilment status. This does not limit any statutory consumer rights."
          />
          <TermsBlock
            title="Address details"
            body="Shipping address details are requested only when you choose to confirm an order through your personal order page. We use them to calculate shipping, create the payment and prepare fulfilment."
          />
          <TermsBlock
            title="Production and delivery"
            body="Estimated delivery can depend on production planning, print approval and shipping. We avoid hard delivery promises until the poster is ready to ship."
          />
          <TermsBlock
            title="If production or shipping fails"
            body="If a paid poster cannot be produced or shipped, we will contact you. If payment has already been made and the order cannot be fulfilled, we will refund the amount paid."
          />
          <TermsBlock
            title="Damage in delivery"
            body="If your poster arrives damaged, email studio@postervalley.nl with your order details and clear photos of the damage so we can review the issue."
          />
          <TermsBlock
            title="Cancellation"
            body="If you want to cancel after payment, contact us as soon as possible at studio@postervalley.nl. Cancellation and withdrawal rights can depend on production and fulfilment status. We will provide return instructions where applicable."
          />
        </div>

        <div className="mt-12 rounded-[1.5rem] border border-ink/12 bg-white/55 p-6 text-sm leading-7 text-ink/56">
          Last updated: 18 July 2026.{' '}
          Read the{' '}
          <a className="underline underline-offset-4 transition hover:text-ink" href={routes.privacy}>
            Privacy Notice
          </a>{' '}
          for how we handle reservation, order, payment and shipping data. Contact:{' '}
          <a
            className="underline underline-offset-4 transition hover:text-ink"
            href="mailto:studio@postervalley.nl"
          >
            studio@postervalley.nl
          </a>
          .
        </div>
      </div>
    </section>
  )
}

function TermsBlock({ id, title, body }: { id?: string; title: string; body: string }) {
  return (
    <div id={id} className="scroll-mt-28 border-t border-ink/12 pt-5">
      <h2 className="font-heading text-3xl tracking-[-0.055em]">{title}</h2>
      <p className="mt-4 leading-7 text-ink/58">{body}</p>
    </div>
  )
}
