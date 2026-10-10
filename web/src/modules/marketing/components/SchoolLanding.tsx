import Link from "next/link";

const highlights = [
  {
    number: "01",
    title: "Curious minds",
    text: "Learning that starts with a question and grows into confidence.",
  },
  {
    number: "02",
    title: "Known deeply",
    text: "Small communities where every student is seen, heard, and supported.",
  },
  {
    number: "03",
    title: "Ready for more",
    text: "A grounded education for a changing, beautifully complicated world.",
  },
];

export function SchoolLanding() {
  return (
    <main className="school-site">
      <section className="school-hero">
        <nav className="school-nav" aria-label="School website navigation">
          <Link className="school-brand" href="/">
            <span className="school-brand-mark">n</span>
            <span>
              <strong>Pathivara </strong>
              <small>Academy</small>
            </span>
          </Link>
          <div className="school-nav-links">
            <a href="#about">Our approach</a>
            <a href="#community">Community</a>
            <a href="#visit">Visit us</a>
          </div>
          <Link className="portal-link" href="/auth">
            Family portal <span>↗</span>
          </Link>
        </nav>

        <div className="hero-copy">
          <p className="school-kicker">Independent day school · Ages 3–18</p>
          <h1>
            Make room
            <br />
            <em>for wonder.</em>
          </h1>
          <p className="hero-description">
            Pathivara is a school for thoughtful, brave young people who are
            ready to make a meaningful mark on the world.
          </p>
          <div className="hero-actions">
            <a className="primary-school-button" href="#visit">
              Plan a visit <span>↗</span>
            </a>
            <a className="quiet-school-link" href="#about">
              Discover Pathivara <span>↓</span>
            </a>
          </div>
        </div>

        <div className="hero-stamp">
          <span>Est.</span>
          <strong>1987</strong>
          <small>
            Cambridge
            <br />
            England
          </small>
        </div>
        <div className="hero-scroll">
          Scroll to explore <span>↓</span>
        </div>
      </section>

      <section className="intro-section" id="about">
        <div className="section-label">A different kind of school</div>
        <div className="intro-content">
          <h2>
            Where <em>possibility</em>
            <br />
            is the starting point.
          </h2>
          <div>
            <p>
              At Pathivara , education is not a race to the finish line. It is a
              chance to notice more, ask better questions, and find the work
              that makes you feel most alive.
            </p>
            <a className="underlined-link" href="#community">
              How we teach <span>↗</span>
            </a>
          </div>
        </div>
      </section>

      <section className="highlight-section" id="community">
        <div className="section-label light-label">
          The Pathivara difference
        </div>
        <div className="highlight-grid">
          {highlights.map((highlight) => (
            <article className="highlight-card" key={highlight.number}>
              <span>{highlight.number}</span>
              <h3>{highlight.title}</h3>
              <p>{highlight.text}</p>
              <a href="#visit" aria-label={`Learn about ${highlight.title}`}>
                ↗
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="visit-section" id="visit">
        <div>
          <p className="school-kicker">Come and see for yourself</p>
          <h2>
            The next chapter
            <br />
            <em>starts here.</em>
          </h2>
        </div>
        <div>
          <p>
            Join us for a morning on campus, meet our people, and see Pathivara
            in motion.
          </p>
          <a
            className="primary-school-button dark-button"
            href="mailto:admissions@Pathivara .example"
          >
            Meet our admissions team <span>↗</span>
          </a>
        </div>
      </section>

      <footer className="school-footer">
        <Link className="school-brand footer-brand" href="/">
          <span className="school-brand-mark">n</span>
          <span>
            <strong>Pathivara </strong>
            <small>Academy</small>
          </span>
        </Link>
        <span>Cambridge, England</span>
        <span>© {new Date().getFullYear()} Pathivara vidhya mandir</span>
        <Link href="/auth">Portal sign in ↗</Link>
      </footer>
    </main>
  );
}
