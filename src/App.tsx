import { FeaturedDesigns } from './components/FeaturedDesigns'
import { FirstDropSection } from './components/FirstDropSection'
import { FloatingPosterHero } from './components/FloatingPosterHero'
import { HowItWorks } from './components/HowItWorks'
import { WaitlistCTA } from './components/WaitlistCTA'

function App() {
  return (
    <main className="min-h-screen overflow-hidden bg-ink text-paper">
      <Header />
      <FloatingPosterHero />
      <FirstDropSection />
      <FeaturedDesigns />
      <HowItWorks />
      <WaitlistCTA />
      <Footer />
    </main>
  )
}

function Header() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-ink/92 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-[88rem] items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
        <a href="#top" className="text-sm uppercase tracking-[0.24em] text-paper">
          Poster Valley
        </a>
        <div className="hidden items-center gap-8 text-xs uppercase tracking-[0.22em] text-white/48 md:flex">
          <a className="nav-link" href="#designs">
            Designs
          </a>
          <a className="nav-link" href="#how-it-works">
            How it works
          </a>
          <a className="nav-link" href="#first-drop">
            About
          </a>
        </div>
        <a className="nav-cta" href="#waitlist">
          Notify me
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
          <a className="nav-link" href="mailto:studio@postervalley.com">
            studio@postervalley.com
          </a>
          <a className="nav-link" href="#top">
            Back to top
          </a>
        </div>
      </div>
    </footer>
  )
}

export default App
