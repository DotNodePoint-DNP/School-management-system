import Link from "next/link";
import {
  getEntries,
  getClasses,
  getProfile,
  sections,
} from "./services/website";
import { assetUrl, formatDate, type PageSection } from "./services/content";
export type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
export default async function SectionPage({
  section,
}: {
  section: Exclude<PageSection, "home">;
}) {
  const [content, classes, profile] = await Promise.all([
    getEntries(section),
    section === "academics" ? getClasses() : null,
    section === "about" ? getProfile() : null,
  ]);
  return (
    <div className="site-wrap site-section">
      <p className="site-crumb">
        <Link href="/">Home</Link> / {sections[section][0]}
      </p>
      <h1>{sections[section][1]}</h1>
      {section === "about" && profile && (
        <aside className="site-facts">
          <h2>{profile.nameEn}</h2>
          <p lang="ne">{profile.nameNp}</p>
          <p>
            {[profile.localLevel, profile.district].filter(Boolean).join(", ")}
          </p>
          {profile.establishedOn && (
            <p>Established {formatDate(profile.establishedOn)}</p>
          )}
        </aside>
      )}
      <div
        className={section === "facilities" ? "site-cards" : "site-articles"}
      >
        {content?.data.map((e) => (
          <article key={e.id}>
            {assetUrl(e.imageUrl) && (
              <img src={assetUrl(e.imageUrl)} alt={e.imageAlt ?? ""} />
            )}
            <h2>{e.title}</h2>
            {e.subtitle && <strong>{e.subtitle}</strong>}
            <p>{e.body}</p>
          </article>
        ))}
      </div>
      {!content?.data.length && (
        <p className="site-empty">
          {content
            ? "No articles have been published yet."
            : "Articles are temporarily unavailable."}
        </p>
      )}
      {section === "academics" && (
        <aside className="site-facts">
          <h2>Classes offered</h2>
          {classes?.data.length ? (
            <ul>
              {classes.data.map((c) => (
                <li key={c.name}>{c.name}</li>
              ))}
            </ul>
          ) : (
            <p>
              {classes
                ? "No classes listed yet."
                : "Classes are temporarily unavailable."}
            </p>
          )}
        </aside>
      )}
    </div>
  );
}
