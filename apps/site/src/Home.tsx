/**
 * The home page (P10.10, MARKETING.md §6): a designed page instead of Markdown, built from the
 * words in home.ts. Screenshots are the site's existing ones; sections with no image use the
 * ghost poses.
 */
import { type Lang, pagePath } from './content.ts';
import { GhostPose } from './ghosts.tsx';
import { HOME } from './home.ts';
import { type ShotSize, shotPath } from './screenshots.ts';

function Shot(p: {
  name: string;
  alt: string;
  lang: Lang;
  shots: Readonly<Record<string, ShotSize>>;
  className?: string;
  /** The hero image: loaded first instead of lazily. */
  eager?: boolean;
}) {
  const size = p.shots[p.name];
  if (!size) return null;
  return (
    <img
      src={shotPath(p.name, p.lang)}
      alt={p.alt}
      width={size.width}
      height={size.height}
      loading={p.eager ? 'eager' : 'lazy'}
      {...(p.eager ? { fetchPriority: 'high' as const } : {})}
      className={p.className}
    />
  );
}

export function Home({
  lang,
  shots,
  existing,
}: {
  lang: Lang;
  shots: Readonly<Record<string, ShotSize>>;
  existing: ReadonlySet<string>;
}) {
  const t = HOME[lang];
  const link = (slug: string) => (existing.has(slug) ? pagePath(lang, slug) : null);
  // Until the downloads exist, "Get started" leads to how it works (get-started and download
  // only say "coming soon"); the second button then isn't needed.
  const how = link('how-it-works');
  const start = how ?? pagePath(lang, '');
  const faq = link('faq');
  return (
    <div className="home">
      <section className="h-hero">
        <div className="h-wrap h-hero-grid">
          <div>
            <p className="h-eyebrow">{t.hero.eyebrow}</p>
            <h1>
              {t.hero.title}
              <br />
              <em>{t.hero.titleEm}</em>
            </h1>
            <p className="h-lede">{t.hero.lede}</p>
            <div className="h-actions">
              <a className="h-btn" href={start}>
                {t.hero.start}
              </a>
              {faq && (
                <a className="h-btn h-btn-quiet" href={faq}>
                  {t.hero.how}
                </a>
              )}
            </div>
            <p className="h-soon">{t.hero.store}</p>
            <ul className="h-pills">
              {t.hero.pills.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
          <div className="h-hero-art">
            <GhostPose pose="wave" size={120} />
            <Shot
              name="phone-chat"
              alt={t.hero.shotAlt}
              lang={lang}
              shots={shots}
              className="h-phone"
              eager
            />
          </div>
        </div>
      </section>

      <section className="h-alt">
        <div className="h-wrap">
          <div className="h-head">
            <h2>{t.asks.title}</h2>
            <p>{t.asks.intro}</p>
          </div>
          <div className="h-grid h-grid-5">
            {t.asks.items.map((a) => (
              <article key={a.title} className="h-card h-ask">
                <GhostPose pose={a.pose} size={72} />
                <h3>{a.title}</h3>
                <p>{a.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="h-wrap">
          <div className="h-head">
            <h2>{t.ways.title}</h2>
            <p>{t.ways.intro}</p>
          </div>
          <div className="h-grid h-grid-2">
            {t.ways.items.map((w) => (
              <article key={w.title} className="h-card h-way">
                <div className="h-shot">
                  <Shot name={w.shot} alt={w.alt} lang={lang} shots={shots} />
                </div>
                <div className="h-body">
                  <span className="h-tag">{w.tag}</span>
                  <h3>{w.title}</h3>
                  <p>{w.text}</p>
                  <ul className="h-needs">
                    {w.needs.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                  <p className="h-cost">{w.cost}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="h-alt">
        <div className="h-wrap h-split">
          <div>
            <div className="h-head h-head-left">
              <h2>{t.family.title}</h2>
              <p>{t.family.intro}</p>
            </div>
            <ul className="h-checks">
              {t.family.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
          <div className="h-shot h-shot-wide">
            <Shot name="hub-family" alt={t.family.shotAlt} lang={lang} shots={shots} />
          </div>
        </div>
      </section>

      <section>
        <div className="h-wrap">
          <div className="h-head">
            <h2>{t.compare.title}</h2>
            <p>{t.compare.intro}</p>
          </div>
          <div className="h-table">
            <table>
              <thead>
                <tr>
                  {t.compare.head.map((h, i) => (
                    <th key={i} scope="col">
                      {i === 0 ? <span className="sr-only">{h}</span> : h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.compare.rows.map(([what, others, hemmia]) => (
                  <tr key={what}>
                    <th scope="row">{what}</th>
                    <td data-label={t.compare.head[1]} className="h-no">
                      {others}
                    </td>
                    <td data-label={t.compare.head[2]} className="h-yes">
                      {hemmia}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="h-alt">
        <div className="h-wrap h-narrow">
          <div className="h-head">
            <p className="h-eyebrow">{t.flow.eyebrow}</p>
            <h2>{t.flow.title}</h2>
            <p>{t.flow.intro}</p>
          </div>
          <ol className="h-flow">
            {t.flow.steps.map((s) => (
              <li key={s.title}>
                <strong>{s.title}</strong>
                <span>{s.text}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section>
        <div className="h-wrap">
          <div className="h-head">
            <h2>{t.promises.title}</h2>
          </div>
          <div className="h-grid h-grid-3">
            {t.promises.items.map((p) => (
              <div key={p.title} className="h-promise">
                <GhostPose pose={p.pose} size={56} />
                <div>
                  <h3>{p.title}</h3>
                  <p>{p.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="h-alt">
        <div className="h-wrap">
          <div className="h-head">
            <h2>{t.cost.title}</h2>
            <p>{t.cost.intro}</p>
          </div>
          <div className="h-grid h-grid-3">
            {t.cost.items.map((c) => (
              <div key={c.title} className="h-card h-price">
                <h3>{c.title}</h3>
                <p className="h-amount">{c.price}</p>
                {c.note && <p className="h-note">{c.note}</p>}
                <p>{c.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="h-wrap h-narrow">
          <div className="h-head">
            <h2>{t.faq.title}</h2>
          </div>
          {t.faq.items.map((f) => (
            <details key={f.q} className="h-faq">
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
          {faq && (
            <p className="h-more">
              <a href={faq}>{t.faq.more} →</a>
            </p>
          )}
          <div className="h-next">
            <h3>{t.next.title}</h3>
            <p>{t.next.text}</p>
          </div>
        </div>
      </section>

      <section className="h-alt h-cta">
        <div className="h-wrap">
          <GhostPose pose="house" size={96} />
          <h2>{t.cta.title}</h2>
          <p>{t.cta.text}</p>
          <a className="h-btn" href={start}>
            {t.cta.start}
          </a>
        </div>
      </section>
    </div>
  );
}
