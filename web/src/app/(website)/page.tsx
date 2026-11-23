import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import BookArtwork from "@/modules/website/BookArtwork";
import { ContentCard } from "@/modules/website/CollectionPage";
import { assetUrl } from "@/modules/website/services/content";
import {
  getEntries,
  listContent,
  getProfile,
} from "@/modules/website/services/website";

export default async function HomePage() {
  const [home, about, academics, notices, events, gallery, profile] =
    await Promise.all([
      getEntries("home"),
      getEntries("about"),
      getEntries("academics"),
      listContent("notices", "?limit=3"),
      listContent("events", "?filter=upcoming"),
      listContent("gallery"),
      getProfile(),
    ]);
  const hero = home?.data[0],
    visual = assetUrl(hero?.imageUrl);
  return (
    <div className="site-wrap">
      <section className="site-hero">
        <div>
          <p className="site-eyebrow">
            <span />
            {hero?.subtitle || profile?.nameEn || "Welcome to our school"}
          </p>
          <h1>
            {hero?.title || profile?.taglineEn || (
              <>
                Make room
                <br />
                for <em>wonder.</em>
              </>
            )}
          </h1>
          <p className="site-lead">
            {hero?.body || "Explore learning and life at our school."}
          </p>
          <div className="site-actions">
            <Link className="site-button" href="/about">
              About our school <ArrowRight size={17} />
            </Link>
            <Link className="site-text-link" href="/contact">
              Contact us <ArrowUpRight size={16} />
            </Link>
          </div>
        </div>
        <div className="site-visual">
          {visual ? (
            <img src={visual} alt={hero?.imageAlt ?? ""} />
          ) : (
            <BookArtwork />
          )}
        </div>
      </section>
      {home?.data.slice(1).map((e) => (
        <article className="school-home-block" key={e.id}>
          {e.imageUrl && (
            <img src={assetUrl(e.imageUrl)} alt={e.imageAlt ?? ""} />
          )}
          <h2>{e.title}</h2>
          <p>{e.body}</p>
        </article>
      ))}
      <div className="site-updates school-intros">
        {(
          [
            ["About", "about", about],
            ["Academics", "academics", academics],
          ] as const
        ).map(([label, key, result]) => (
          <section key={key}>
            <p className="site-eyebrow">{label}</p>
            <h2>{result?.data[0]?.title || label}</h2>
            <p>{result?.data[0]?.body}</p>
            <Link className="site-text-link" href={"/" + key}>
              Explore {label.toLowerCase()} <ArrowRight size={16} />
            </Link>
          </section>
        ))}
      </div>
      {(
        [
          ["Pinned notices", "notices", notices],
          ["Upcoming events", "events", events],
          ["Gallery", "gallery", gallery],
        ] as const
      ).map(([heading, resource, result]) => {
        const rows = result?.data
          .filter((e) => resource !== "notices" || e.isPinned)
          .slice(0, 3);
        return (
          <section className="school-home-block" key={resource}>
            <div className="site-subhead">
              <h2>{heading}</h2>
              <Link href={"/" + resource}>
                View all <ArrowRight size={15} />
              </Link>
            </div>
            <div className="school-card-grid">
              {rows?.map((item) => (
                <ContentCard key={item.id} item={item} resource={resource} />
              ))}
            </div>
            {!rows?.length && (
              <p className="site-empty">
                {result
                  ? "No " + heading.toLowerCase() + " available yet."
                  : "Temporarily unavailable."}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
