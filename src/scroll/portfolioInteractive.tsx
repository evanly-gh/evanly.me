/**
 * Interactive primitives for the post-ride portfolio page (NativePortfolio).
 *
 * Everything here is progressive-enhancement: each primitive takes an
 * `interactive` flag. When it is false (the sr-only immersive mode, or any time
 * we don't want motion) the component renders in its final, fully-visible state
 * with no observers, no animation, and no hidden content — so screen readers and
 * no-JS/reduced-motion visitors always get complete, readable output.
 */
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/** Live `prefers-reduced-motion` flag. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return reduced;
}

/**
 * Fire-once "is this element scrolled into view" hook. Returns a ref to attach
 * and a boolean that flips true the first time the element intersects. When
 * `animate` is false it reports visible immediately (no observer).
 */
export function useInView<T extends HTMLElement>(
  animate: boolean,
): readonly [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(!animate);
  useEffect(() => {
    if (!animate) {
      setInView(true);
      return undefined;
    }
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry && entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [animate]);
  return [ref, inView] as const;
}

/** A section that fades + rises into view the first time it is scrolled to. */
export function RevealSection({
  id,
  labelledBy,
  className = '',
  animate,
  children,
}: {
  id: string;
  labelledBy?: string;
  className?: string;
  animate: boolean;
  children: ReactNode;
}) {
  const [ref, inView] = useInView<HTMLElement>(animate);
  return (
    <section
      id={id}
      ref={ref}
      aria-labelledby={labelledBy}
      className={`np-reveal ${inView ? 'is-visible' : ''} ${className}`.trim()}
    >
      {children}
    </section>
  );
}

/** Generic reveal wrapper (for cards/rows), with an optional stagger delay. */
export function Reveal({
  className = '',
  animate,
  delayMs = 0,
  children,
}: {
  className?: string;
  animate: boolean;
  delayMs?: number;
  children: ReactNode;
}) {
  const [ref, inView] = useInView<HTMLDivElement>(animate);
  return (
    <div
      ref={ref}
      className={`np-reveal ${inView ? 'is-visible' : ''} ${className}`.trim()}
      style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </div>
  );
}

/** Count-up number, triggered when it scrolls into view. */
export function StatCounter({
  to,
  decimals = 0,
  prefix = '',
  suffix = '',
  animate,
}: {
  to: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  animate: boolean;
}) {
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLSpanElement>(animate);
  const [value, setValue] = useState(animate ? 0 : to);
  useEffect(() => {
    if (!inView) return undefined;
    if (!animate || reduced) {
      setValue(to);
      return undefined;
    }
    const duration = 1100;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      setValue(to * eased);
      if (progress < 1) raf = requestAnimationFrame(tick);
      else setValue(to);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, animate, reduced, to]);
  return (
    <span ref={ref} className="np-stat__value">
      {prefix}
      {value.toFixed(decimals)}
      {suffix}
    </span>
  );
}

export interface HudItem {
  id: string;
  idx: string;
  label: string;
}

/** Sticky HUD nav that scroll-spies the section crossing the viewport centre. */
export function HudNav({
  items,
  animate,
}: {
  items: readonly HudItem[];
  animate: boolean;
}) {
  const [active, setActive] = useState(items[0]?.id ?? '');
  useEffect(() => {
    if (!animate || typeof IntersectionObserver === 'undefined') return undefined;
    const elements = items
      .map((item) => document.getElementById(item.id))
      .filter((element): element is HTMLElement => element !== null);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const top = visible[0]?.target as HTMLElement | undefined;
        if (top) setActive(top.id);
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: [0, 0.25, 0.5, 1] },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [items, animate]);
  return (
    <nav className="np-hudnav" aria-label="Portfolio sections">
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className={`np-hudnav__link ${active === item.id ? 'is-active' : ''}`.trim()}
          aria-current={active === item.id ? 'true' : undefined}
        >
          <span className="np-hudnav__idx">{item.idx}</span>
          {item.label}
        </a>
      ))}
    </nav>
  );
}

export type WorkCategory = 'applied' | 'research';

export interface WorkItem {
  title: string;
  stack: string;
  blurb: string;
  category: WorkCategory;
  badge: string;
}

function WorkCard({
  item,
  index,
  animate,
}: {
  item: WorkItem;
  index: number;
  animate: boolean;
}) {
  const tags = item.stack.split('·').map((tag) => tag.trim()).filter(Boolean);
  return (
    <Reveal className="np-card" animate={animate} delayMs={(index % 3) * 90}>
      <article className="np-card__inner">
        <header className="np-card__head">
          <span className={`np-card__badge np-card__badge--${item.category}`}>
            {item.badge}
          </span>
          <h3 className="np-card__title">{item.title}</h3>
        </header>
        <ul className="np-card__tags">
          {tags.map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
        <p className="np-card__blurb">{item.blurb}</p>
      </article>
    </Reveal>
  );
}

const WORK_FILTERS: ReadonlyArray<{ id: 'all' | WorkCategory; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'applied', label: 'Applied' },
  { id: 'research', label: 'Research' },
];

/** Filterable Work grid: tab through All / Applied / Research. */
export function WorkGrid({
  items,
  animate,
}: {
  items: readonly WorkItem[];
  animate: boolean;
}) {
  const [filter, setFilter] = useState<'all' | WorkCategory>('all');
  const shown = animate
    ? items.filter((item) => filter === 'all' || item.category === filter)
    : items;
  const countFor = (id: 'all' | WorkCategory) =>
    id === 'all' ? items.length : items.filter((item) => item.category === id).length;
  return (
    <>
      {animate && (
        <div className="np-filter" role="tablist" aria-label="Filter work">
          {WORK_FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={filter === option.id}
              className={`np-filter__tab ${filter === option.id ? 'is-active' : ''}`.trim()}
              onClick={() => setFilter(option.id)}
            >
              {option.label}
              <span className="np-filter__count">{countFor(option.id)}</span>
            </button>
          ))}
        </div>
      )}
      <div className="np-work-grid">
        {shown.map((item, index) => (
          <WorkCard
            key={item.title}
            item={item}
            index={index}
            animate={animate}
          />
        ))}
      </div>
    </>
  );
}
