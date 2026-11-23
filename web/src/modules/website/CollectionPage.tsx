import Link from "next/link";
import { notFound } from "next/navigation";
import {
  categories,
  assetUrl,
  formatDate,
  displayName,
  type Collection,
  type Content,
} from "./services/content";
import { listContent, sections, getContent } from "./services/website";
import type { PageProps } from "./SectionPage";
import PublicForm from "./PublicForm";

function info(resource: Collection, item: Content) {
  switch (resource) {
    case "notices":
      return [
        item.isPinned ? "Pinned" : null,
        item.category,
        item.publishedAt ? formatDate(item.publishedAt) : null,
      ];
    case "events":
      return [
        item.startsAt ? formatDate(item.startsAt, !item.isAllDay) : null,
        item.venue,
      ];
    case "gallery":
      return [item.eventDate ? formatDate(item.eventDate) : null];
    case "careers":
      return [
        item.department,
        item.employmentType && displayName(item.employmentType),
        item.deadline && "Apply by " + formatDate(item.deadline),
      ];
  }
}
export function ContentCard({
  resource,
  item,
}: {
  resource: Collection;
  item: Content;
}) {
  const image = assetUrl(item.coverImage ?? item.imageUrl);
  return (
    <Link
      className="school-content-card"
      href={"/" + resource + "/" + encodeURIComponent(item.slug)}
    >
      {image && <img loading="lazy" src={image} alt={item.imageAlt ?? ""} />}
      <div>
        <small>{info(resource, item).filter(Boolean).join(" · ")}</small>
        <h3>{item.title}</h3>
        {(item.summary || item.description) && (
          <p>{item.summary || item.description}</p>
        )}
      </div>
    </Link>
  );
}
export default async function CollectionPage({
  resource,
  searchParams,
}: PageProps & { resource: Collection }) {
  const params = await searchParams;
  const page = Number(params.page ?? 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000) notFound();
  const category =
    typeof params.category === "string" &&
    categories.some((v) => v === params.category)
      ? params.category
      : "";
  const filter = params.filter === "past" ? "past" : "upcoming";
  const query = new URLSearchParams();
  if (resource === "notices") {
    query.set("page", String(page));
    query.set("limit", "12");
    if (category) query.set("category", category);
  }
  if (resource === "events") query.set("filter", filter);
  const result = await listContent(resource, "?" + query);
  if (result?.meta && page > Math.max(1, result.meta.totalPages)) notFound();
  const pageUrl = (n: number) =>
    "?" +
    new URLSearchParams({ ...Object.fromEntries(query), page: String(n) });
  return (
    <div className="site-wrap site-section">
      <p className="site-crumb">
        <Link href="/">Home</Link> / {sections[resource][0]}
      </p>
      <h1>{sections[resource][1]}</h1>
      <p className="site-lead">{sections[resource][2]}</p>
      {resource === "notices" && (
        <nav aria-label="Notice categories" className="site-filters">
          {["", ...categories].map((v) => (
            <Link
              key={v}
              aria-current={category === v ? "page" : undefined}
              href={v ? "?category=" + v : "/notices"}
            >
              {v || "All notices"}
            </Link>
          ))}
        </nav>
      )}
      {resource === "events" && (
        <nav aria-label="Event period" className="site-filters">
          {["upcoming", "past"].map((v) => (
            <Link
              key={v}
              aria-current={v === filter ? "page" : undefined}
              href={"?filter=" + v}
            >
              {v}
            </Link>
          ))}
        </nav>
      )}
      <div className="school-card-grid">
        {result?.data.map((item) => (
          <ContentCard key={item.id} item={item} resource={resource} />
        ))}
      </div>
      {!result?.data.length && (
        <p className="site-empty">
          {result
            ? "No " +
              (resource === "gallery" ? "albums" : resource) +
              " to display."
            : "This section is temporarily unavailable."}
        </p>
      )}
      {result?.meta && result.meta.totalPages > 1 && (
        <nav aria-label="Pagination" className="site-pages">
          {page > 1 && <Link href={pageUrl(page - 1)}>Previous</Link>} Page{" "}
          {page} of {result.meta.totalPages}{" "}
          {page < result.meta.totalPages && (
            <Link href={pageUrl(page + 1)}>Next</Link>
          )}
        </nav>
      )}
    </div>
  );
}
export async function ContentDetail({
  resource,
  slug,
}: {
  resource: Collection;
  slug: string;
}) {
  const item = (await getContent(resource, slug))?.data;
  if (!item) throw new Error("This item is temporarily unavailable.");
  const image = assetUrl(item.coverImage ?? item.imageUrl);
  return (
    <div className="site-wrap site-section">
      <p className="site-crumb">
        <Link href="/">Home</Link> /{" "}
        <Link href={"/" + resource}>{sections[resource][0]}</Link>
      </p>
      <h1>{item.title}</h1>
      <p className="site-lead">
        {info(resource, item).filter(Boolean).join(" · ")}
      </p>
      {resource === "events" && item.endsAt && (
        <p>
          Ends {formatDate(item.endsAt, !item.isAllDay)}{" "}
          {item.isAllDay ? "" : "(Nepal time)"}
        </p>
      )}
      {image && (
        <img
          className="school-detail-image"
          src={image}
          alt={item.imageAlt ?? ""}
        />
      )}
      {item.summary && <p className="site-lead">{item.summary}</p>}
      <article>
        <p>{item.body ?? item.description}</p>
      </article>
      {assetUrl(item.attachmentUrl) && (
        <a className="site-text-link" href={assetUrl(item.attachmentUrl)}>
          Open notice attachment
        </a>
      )}
      {resource === "gallery" && (
        <div className="school-card-grid">
          {item.photos?.map((photo) => (
            <figure key={photo.id}>
              <img
                loading="lazy"
                src={assetUrl(photo.imageUrl)}
                alt={photo.altText ?? ""}
              />
              {photo.caption && <figcaption>{photo.caption}</figcaption>}
            </figure>
          ))}
        </div>
      )}
      {resource === "careers" && (
        <>
          <dl className="site-facts">
            {[
              ["Vacancies", item.vacancies],
              ["Qualification", item.qualification],
              ["Experience", item.experience],
            ].map(
              ([label, value]) =>
                value && (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ),
            )}
          </dl>
          <PublicForm careerSlug={slug} />
        </>
      )}
    </div>
  );
}
