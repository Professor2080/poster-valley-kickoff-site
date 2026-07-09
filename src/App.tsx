import { useEffect, useState } from 'react'
import { DesignDetailPage } from './components/DesignDetailPage'
import { FeaturedDesigns } from './components/FeaturedDesigns'
import { FirstDropSection } from './components/FirstDropSection'
import { FloatingPosterHero } from './components/FloatingPosterHero'
import { HowItWorks } from './components/HowItWorks'
import { PrivacyPage } from './components/PrivacyPage'
import { WaitlistCTA } from './components/WaitlistCTA'
import { getDropRoute, isPrivacyRoute, routes } from './lib/routes'

function App() {
  const [pathname, setPathname] = useState(window.location.pathname)

  useEffect(() => {
    const handleNavigation = () => setPathname(window.location.pathname)

    window.addEventListener('popstate', handleNavigation)
    return () => window.removeEventListener('popstate', handleNavigation)
  }, [])

  const detailDrop = getDropRoute(pathname)
  const isDetailPage = Boolean(detailDrop)
  const isPrivacyPage = isPrivacyRoute(pathname)
  const isLightPage = isDetailPage || isPrivacyPage

  return (
    <main className="min-h-screen overflow-hidden bg-ink text-paper">
      <Header isLightPage={isLightPage} />
      {detailDrop ? (
        <DesignDetailPage drop={detailDrop} />
      ) : isPrivacyPage ? (
        <PrivacyPage />
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
    <footer className="border-t border-white/10 bg-ink px-5 py-10 text-sm text-white/46 sm:px-8">
      <div className="mx-auto flex max-w-[88rem] flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <p>Poster Valley - curated poster drops, released with intention.</p>
        <div className="flex flex-wrap gap-5">
          <a className="nav-link" href="mailto:studio@postervalley.nl">
            studio@postervalley.nl
          </a>
          <a className="nav-link" href={routes.privacy}>
            Privacy
          </a>
          <a className="nav-link" href={routes.home}>
            Back to top
          </a>
        </div>
      </div>
    </footer>
  )
}

export default App
