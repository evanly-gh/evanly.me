import { RESUME, type Project } from '../content/resume';

export type NativePortfolioMode =
  | 'immersive'
  | 'text'
  | 'reduced'
  | 'compact'
  | 'webgl-fallback';

const projectCard = (project: Project) => (
  <article key={project.title} className="native-project">
    <h3>{project.title}</h3>
    <p className="native-project__stack">{project.stack}</p>
    <p>{project.blurb}</p>
  </article>
);

export function SkipToContent() {
  return (
    <a className="skip-to-content" href="#portfolio-content">
      Skip to portfolio content
    </a>
  );
}

export function NativePortfolio({ mode }: { mode: NativePortfolioMode }) {
  const visible = mode !== 'immersive';
  return (
    <article
      id="portfolio-content"
      tabIndex={-1}
      className={
        `native-portfolio native-portfolio--${mode} `
        + (visible
          ? 'native-portfolio--visible'
          : 'native-portfolio--immersive')
      }
      data-presentation={mode}
    >
      <header className="native-portfolio__hero">
        <p className="native-portfolio__eyebrow">Portfolio</p>
        <h1>{RESUME.name}</h1>
        <p>{RESUME.tagline}</p>
        <nav aria-label="Portfolio sections">
          <a href="#about">About</a>
          <a href="#projects">Projects</a>
          <a href="#research">Research</a>
          <a href="#education">Education</a>
          <a href="#contact">Contact</a>
        </nav>
      </header>

      <section id="about" aria-labelledby="about-heading">
        <h2 id="about-heading">About</h2>
        <p>{RESUME.about.paragraph}</p>
      </section>

      <section id="projects" aria-labelledby="projects-heading">
        <h2 id="projects-heading">Projects</h2>
        <div className="native-card-grid">
          {[...RESUME.projectsMain, ...RESUME.projectsSmall].map(projectCard)}
        </div>
      </section>

      <section id="research" aria-labelledby="research-heading">
        <h2 id="research-heading">Research</h2>
        <div className="native-card-grid">
          {RESUME.research.map(projectCard)}
        </div>
        <h3>Experience</h3>
        <ol className="native-timeline">
          {RESUME.experience.map((entry) => (
            <li key={`${entry.role}-${entry.org}`}>
              <h4>{entry.role} · {entry.org}</h4>
              <p>{entry.period}</p>
              {entry.detail && <p>{entry.detail}</p>}
            </li>
          ))}
        </ol>
      </section>

      <section id="education" aria-labelledby="education-heading">
        <h2 id="education-heading">Education</h2>
        <h3>{RESUME.education.school}</h3>
        <ul>
          {RESUME.education.degrees.map((degree) => <li key={degree}>{degree}</li>)}
        </ul>
        <p>
          {RESUME.education.honors} · {RESUME.education.graduation} · GPA{' '}
          {RESUME.education.gpa}
        </p>
        <p>Coursework: {RESUME.education.coursework.join(', ')}</p>

        <h3>Skills</h3>
        <dl className="native-skills">
          {Object.entries(RESUME.skills).map(([group, skills]) => (
            <div key={group}>
              <dt>{group}</dt>
              <dd>{skills.join(', ')}</dd>
            </div>
          ))}
        </dl>

        <h3>Achievements</h3>
        <ul>
          {RESUME.achievements.map((achievement) => (
            <li key={achievement}>{achievement}</li>
          ))}
        </ul>
      </section>

      <footer id="contact" aria-labelledby="contact-heading">
        <h2 id="contact-heading">Contact</h2>
        <ul className="native-contact">
          <li>
            <a href={`mailto:${RESUME.contact.email}`}>
              {RESUME.contact.email}
            </a>
          </li>
          <li>
            <a
              href={`https://${RESUME.contact.linkedin}`}
              target="_blank"
              rel="noreferrer"
            >
              LinkedIn
            </a>
          </li>
          <li>
            <a
              href={`https://${RESUME.contact.github}`}
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          </li>
        </ul>
      </footer>
    </article>
  );
}
