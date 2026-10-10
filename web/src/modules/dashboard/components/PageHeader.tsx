// src/modules/dashboard/components/PageHeader.tsx
import Link from "next/link";

export type Crumb = { label: string; href: string };

export function PageHeader({
  title,
  description,
  crumbs = [],
}: {
  title: string;
  description?: string;
  crumbs?: Crumb[];
}) {
  return (
    <header className="mb-5">
      {crumbs.length > 0 && (
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1.5 text-[15px] text-neutral-500">
            {crumbs.map((crumb, i) => (
              <li key={crumb.href} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden>/</span>}
                <Link
                  href={crumb.href}
                  className="rounded outline-none hover:text-stone-200 focus-visible:ring-2 focus-visible:ring-neutral-500"
                >
                  {crumb.label}
                </Link>
              </li>
            ))}
          </ol>
        </nav>
      )}
      <h1 className="text-[22px] font-medium leading-snug text-stone-50">{title}</h1>
      {description && (
        <p className="mt-1 text-[15px] text-neutral-400">{description}</p>
      )}
    </header>
  );
}