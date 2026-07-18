import { useEffect, useState } from 'react'
import { DesignDetailPage } from './components/DesignDetailPage'
import { FeaturedDesigns } from './components/FeaturedDesigns'
import { FirstDropSection } from './components/FirstDropSection'
import { FloatingPosterHero } from './components/FloatingPosterHero'
import { HowItWorks } from './components/HowItWorks'
import { OrderInvitationPage } from './components/OrderInvitationPage'
import { PrivacyPage } from './components/PrivacyPage'
import { TermsPage } from './components/TermsPage'
import { WaitlistCTA } from './components/WaitlistCTA'
import { legalDetails } from './data/legal'
import { getDropRoute, getOrderTokenRoute, isPrivacyRoute, isTermsRoute, routes } from './lib/routes'

function App() {
  const [pathname, setPathname] = useState(window.location.pathname)

  useEffect(() => {
    const handleNavigation = () => setPathname(window.location.pathname)

    window.addEventListener('popstate', handleNavigation)
    return () => window.removeEventListener('popstate', handleNavigation)
  }, [])

  const detailDrop = getDropRoute(pathname)
  const orderToken = getOrderTokenRoute(pathname)
  const isDetailPage = Boolean(detailDrop)
  const isPrivacyPage = isPrivacyRoute(pathname)
  const isTermsPage = isTermsRoute(pathname)
  const isOrderPage = Boolean(orderToken)
  const isLightPage = isDetailPage || isPrivacyPage || isTermsPage || isOrderPage

  return (
    <main className="min-h-screen overflow-hidden bg-ink text-paper">
      <Header isLightPage={isLightPage} />
      {detailDrop ? (
        <DesignDetailPage drop={detailDrop} />
      ) : orderToken ? (
        <OrderInvitationPage token={orderToken} />
      ) : isPrivacyPage ? (
        <PrivacyPage />
      ) : isTermsPage ? (
        <TermsPage />
      ) : (
        <>
          <FloatingPosterHero />
          <FirstDropSection />
          <FeaturedDesigns />
          <HowItWorks />
          <WaitlistCTA />
        </>
      )}
      <Footer />
    </main>
  )
}

function Header({ isLightPage }: { isLightPage: boolean }) {
  const headerClass = isLightPage
    ? 'fixed inset-x-0 top-0 z-50 border-b border-ink/10 bg-paper/92 text-ink backdrop-blur-xl'
    : 'fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-ink/92 text-paper backdrop-blur-xl'
  const linkClass = isLightPage
    ? 'transition hover:text-ink focus-visible:text-ink'
    : 'nav-link'

  return (
    <header className={headerClass}>
      <nav className="mx-auto flex max-w-[88rem] items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
        <a href={routes.home} className="text-sm uppercase tracking-[0.24em]">
          Poster Valley
        </a>
        <div
          className={`hidden items-center gap-8 text-xs uppercase tracking-[0.22em] md:flex ${
            isLightPage ? 'text-ink/48' : 'text-white/48'
          }`}
        >
          <a className={linkClass} href={isLightPage ? `${routes.home}#designs` : '#designs'}>
            Designs
          </a>
          <a
            className={linkClass}
            href={isLightPage ? `${routes.home}#how-it-works` : '#how-it-works'}
          >
            How it works
          </a>
          <a className={linkClass} href={routes.firstDrop}>
            First drop
          </a>
        </div>
        <a
          className={isLightPage ? 'button-outline-dark' : 'nav-cta'}
          href={isLightPage ? routes.firstDropInterest : '#waitlist'}
        >
          {isLightPage ? 'Reserve' : 'Get updates'}
        </a>
      </nav>
    </header>
  )
}

function Footer() {
  return (
    <footer
      id="legal-details"
      className="border-t border-white/10 bg-ink px-5 py-12 text-sm text-white/52 sm:px-8 lg:px-12"
    >
      <div className="mx-auto grid max-w-[88rem] gap-10 md:grid-cols-[0.8fr_1.25fr_0.75fr] md:gap-8 lg:gap-16">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-paper">Poster Valley</p>
          <p className="mt-4 max-w-xs leading-6">
            Curated poster drops, released with intention.
          </p>
        </div>

        <div>
          <p className="eyebrow text-white/38">Seller / Legal entity</p>
          <p className="mt-4 font-semibold text-white/82">
            {legalDetails.sellerName} ({legalDetails.englishName})
          </p>
          <p className="mt-1 leading-6">Poster Valley is part of {legalDetails.sellerName}.</p>
          <address className="mt-4 not-italic leading-6">
            {legalDetails.addressLines.map((line) => (
              <span className="block" key={line}>
                {line}
              </span>
            ))}
          </address>
          <dl className="mt-4 grid gap-x-6 gap-y-1 leading-6 sm:grid-cols-2">
            <div>
              <dt className="inline">Chamber of Commerce: </dt>
              <dd className="inline text-white/76">{legalDetails.chamberOfCommerce}</dd>
            </div>
            <div>
              <dt className="inline">VAT number: </dt>
              <dd className="inline text-white/76">{legalDetails.vatNumber}</dd>
            </div>
          </dl>
          <a className="nav-link mt-3 inline-block text-white/76" href={`mailto:${legalDetails.email}`}>
            {legalDetails.email}
          </a>
        </div>

        <nav aria-label="Legal, payment and contact information">
          <p className="eyebrow text-white/38">Information</p>
          <div className="mt-4 flex flex-col items-start gap-3">
            <a className="nav-link" href={routes.terms}>
              Terms
            </a>
            <a className="nav-link" href={`${routes.terms}#payment-terms`}>
              Payment terms
            </a>
            <a className="nav-link" href={`${routes.terms}#shipping-and-returns`}>
              Shipping &amp; returns
            </a>
            <a className="nav-link" href={routes.privacy}>
              Privacy Notice
            </a>
            <a className="nav-link" href={`mailto:${legalDetails.email}`}>
              Contact
            </a>
          </div>
        </nav>
      </div>
    </footer>
  )
}

export default App
