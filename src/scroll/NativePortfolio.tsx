import { RESUME } from '../content/resume';
import {
  HudNav,
  Reveal,
  RevealSection,
  StatCounter,
  WorkGrid,
  type HudItem,
  type WorkItem,
} from './portfolioInteractive';
import './NativePortfolio.css';

export type NativePortfolioMode =
  | 'immersive'
  | 'outro'
  | 'text'
  | 'reduced'
  | 'compact'
  | 'webgl-fallback';

// ── Content derived from the single resume source ──────────────────────────
const WORK_ITEMS: readonly WorkItem[] = [
  ...RESUME.projects.map((project): WorkItem => ({
    title: project.title,
    stack: project.stack,
    blurb: project.blurb,
    category: 'applied',
    badge: 'APPLIED',
  })),
  ...RESUME.research.map((project): WorkItem => ({
    title: project.title,
    stack: project.stack,
    blurb: project.blurb,
    category: 'research',
    badge: 'RESEARCH',
  })),
];

const NAV_ITEMS: readonly HudItem[] = [
  { id: 'work', idx: '01', label: 'Work' },
  { id: 'about', idx: '02', label: 'About' },
  { id: 'experience', idx: '03', label: 'Experience' },
  { id: 'skills', idx: '04', label: 'Skills' },
  { id: 'contact', idx: '05', label: 'Contact' },
];

interface Stat {
  to: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  label: string;
  sub: string;
}

const STATS: readonly Stat[] = [
  { to: 3.9, decimals: 1, label: 'GPA', sub: 'interdisc. honors' },
  { to: 7, label: 'systems shipped', sub: '4 apps · 3 research' },
  { to: 2.88, decimals: 2, suffix: '×', label: 'decode speedup', sub: 'SD on Qwen3.5' },
  { to: 100, prefix: '~', label: 'KleoKlaw users', sub: 'founding dev' },
];

// The single strongest single-line credential gets a spotlight above the grid.
const FEATURED = RESUME.projects.find((p) => p.title === 'RhetBench') ?? RESUME.projects[0];

export function SkipToContent() {
  return (
    <a className="skip-to-content" href="#portfolio-content">
      Skip to portfolio content
    </a>
  );
}

/**
 * Portfolio hero (eyebrow / name / tagline). Shared so the post-moon outro
 * banner rendered over the 3D canvas is byte-identical to the top of the static
 * page it hands off to — the tilt-up lands on this exact block. Only the banner
 * variant is used now (the page below has its own richer hero); kept intact so
 * ScrollExperience's OutroBanner is unchanged.
 */
export function PortfolioHero({
  variant = 'page',
}: {
  variant?: 'page' | 'banner';
}) {
  return (
    <header
      className={
        'native-portfolio__hero'
        + (variant === 'banner' ? ' native-portfolio__hero--banner' : '')
      }
    >
      <p className="native-portfolio__eyebrow">Portfolio</p>
      <h1>{RESUME.name}</h1>
      <p className="native-portfolio__tagline">{RESUME.tagline}</p>
      {variant === 'page' && (
        <nav aria-label="Portfolio sections">
          <a href="#work">Work</a>
          <a href="#about">About</a>
          <a href="#experience">Experience</a>
          <a href="#skills">Skills</a>
          <a href="#contact">Contact</a>
        </nav>
      )}
    </header>
  );
}

function SectionHead({ idx, title }: { idx: string; title: string }) {
  return (
    <div className="np-section__head">
      <span className="np-section__idx">{idx}</span>
      <h2 className="np-section__title">{title}</h2>
      <span className="np-section__rule" aria-hidden="true" />
    </div>
  );
}

export function NativePortfolio({ mode }: { mode: NativePortfolioMode }) {
  // `immersive` renders sr-only (complete, unstyled, no motion) for the 3D
  // experience; every other mode is a fully visible, interactive neon page.
  const interactive = mode !== 'immersive';
  const rootClass = interactive
    ? `native-portfolio np native-portfolio--${mode}`
    : 'native-portfolio native-portfolio--immersive';

  return (
    <article
      id="portfolio-content"
      tabIndex={-1}
      className={rootClass}
      data-presentation={mode}
    >
      {interactive && <div className="np__scanlines" aria-hidden="true" />}
      <div className="np__inner">
        {/* ── Hero ── */}
        <header className="np-hero">
          <p className="np-hero__eyebrow">// ML SYSTEMS ENGINEER</p>
          <h1 className="np-hero__name" data-text={RESUME.name}>
            {RESUME.name}
          </h1>
          <p className="np-hero__tagline">{RESUME.tagline}</p>
          <p className="np-hero__blurb">{RESUME.about.heroBlurb}</p>
          <div className="np-hero__cta">
            <a className="np-btn np-btn--primary" href="#work">
              View work
            </a>
            <a className="np-btn" href={`mailto:${RESUME.contact.email}`}>
              Email
            </a>
            <a
              className="np-btn"
              href={`https://${RESUME.contact.github}`}
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          </div>
        </header>

        {interactive && <HudNav items={NAV_ITEMS} animate={interactive} />}

        {/* ── Stat strip ── */}
        <div className="np-stats" role="list" aria-label="Key metrics">
          {STATS.map((stat, index) => (
            <Reveal
              key={stat.label}
              className="np-stat"
              animate={interactive}
              delayMs={index * 80}
            >
              <div role="listitem">
                <StatCounter
                  to={stat.to}
                  decimals={stat.decimals}
                  prefix={stat.prefix}
                  suffix={stat.suffix}
                  animate={interactive}
                />
                <span className="np-stat__label">{stat.label}</span>
                <span className="np-stat__sub">{stat.sub}</span>
              </div>
            </Reveal>
          ))}
        </div>

        {/* ── Featured spotlight ── */}
        <RevealSection
          id="featured"
          labelledBy="featured-heading"
          className="np-featured"
          animate={interactive}
        >
          <p className="np-featured__badge">Featured · SWECCATHON 2026 — 1st</p>
          <h2 id="featured-heading" className="np-featured__title">
            {FEATURED.title}
          </h2>
          <p className="np-featured__stack">{FEATURED.stack}</p>
          <p className="np-featured__blurb">{FEATURED.blurb}</p>
        </RevealSection>

        {/* ── Work grid ── */}
        <RevealSection id="work" labelledBy="work-heading" animate={interactive}>
          <div id="work-heading">
            <SectionHead idx="01" title="Work" />
          </div>
          <WorkGrid items={WORK_ITEMS} animate={interactive} />
        </RevealSection>

        {/* ── About (terminal flourish) ── */}
        <RevealSection id="about" labelledBy="about-heading" animate={interactive}>
          <div id="about-heading">
            <SectionHead idx="02" title="About" />
          </div>
          <div className="np-term">
            <div className="np-term__bar" aria-hidden="true">
              <span className="np-term__dot np-term__dot--r" />
              <span className="np-term__dot np-term__dot--y" />
              <span className="np-term__dot np-term__dot--g" />
              <span className="np-term__bar-title">evan@uw : ~/about</span>
            </div>
            <div className="np-term__body">
              <p className="np-term__prompt">
                <span className="np-term__user">evan@uw</span>
                <span className="np-term__sym">:~$</span> whoami
              </p>
              <p className="np-term__out">{RESUME.about.paragraph}</p>
            </div>
          </div>
        </RevealSection>

        {/* ── Experience ── */}
        <RevealSection
          id="experience"
          labelledBy="experience-heading"
          animate={interactive}
        >
          <div id="experience-heading">
            <SectionHead idx="03" title="Experience" />
          </div>
          <ol className="np-timeline">
            {RESUME.experience.map((entry, index) => (
              <Reveal
                key={`${entry.role}-${entry.org}`}
                className="np-timeline__item"
                animate={interactive}
                delayMs={index * 80}
              >
                <li>
                  <span className="np-timeline__period">{entry.period}</span>
                  <h3 className="np-timeline__role">{entry.role}</h3>
                  <p className="np-timeline__org">{entry.org}</p>
                  {entry.detail && (
                    <p className="np-timeline__detail">{entry.detail}</p>
                  )}
                </li>
              </Reveal>
            ))}
          </ol>
        </RevealSection>

        {/* ── Skills + education ── */}
        <RevealSection id="skills" labelledBy="skills-heading" animate={interactive}>
          <div id="skills-heading">
            <SectionHead idx="04" title="Skills" />
          </div>
          <div className="np-skills">
            {Object.entries(RESUME.skills).map(([group, skills]) => (
              <div key={group} className="np-skills__group">
                <h3 className="np-skills__label">{group}</h3>
                <ul className="np-chips">
                  {skills.map((skill) => (
                    <li key={skill} className="np-chip">
                      {skill}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="np-edu">
            <div className="np-edu__block">
              <h3 className="np-edu__school">{RESUME.education.school}</h3>
              <p className="np-edu__degrees">
                {RESUME.education.degrees.join(' · ')}
              </p>
              <p className="np-edu__meta">
                {RESUME.education.honors} · {RESUME.education.graduation} · GPA{' '}
                {RESUME.education.gpa}
              </p>
              <p className="np-edu__course">
                Coursework: {RESUME.education.coursework.join(', ')}
              </p>
            </div>
            <ul className="np-achievements">
              {RESUME.achievements.map((achievement) => (
                <li key={achievement} className="np-achievement">
                  {achievement}
                </li>
              ))}
            </ul>
          </div>
        </RevealSection>

        {/* ── Contact ── */}
        <footer id="contact" className="np-contact-section">
          <SectionHead idx="05" title="Contact" />
          <p className="np-contact__lead">
            Building efficient ML that ships. Let’s talk.
          </p>
          <div className="np-contact">
            <a className="np-btn np-btn--primary" href={`mailto:${RESUME.contact.email}`}>
              {RESUME.contact.email}
            </a>
            <a
              className="np-btn"
              href={`https://${RESUME.contact.linkedin}`}
              target="_blank"
              rel="noreferrer"
            >
              LinkedIn
            </a>
            <a
              className="np-btn"
              href={`https://${RESUME.contact.github}`}
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          </div>
        </footer>
      </div>
    </article>
  );
}
