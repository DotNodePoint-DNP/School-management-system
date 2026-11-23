import type { Prisma } from '../../generated/prisma/client.js';

export function slugBase(title: string): string {
  const normalized = title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return (
    Array.from(normalized).slice(0, 120).join('').replace(/-+$/, '') || 'item'
  );
}
export function availableSlug(
  base: string,
  existing: Iterable<string | null>,
): string {
  const used = new Set(existing);
  let slug = base;
  for (let suffix = 2; used.has(slug); suffix++) slug = base + '-' + suffix;
  return slug;
}
export async function allocateSlug(
  tx: Prisma.TransactionClient,
  resource: string,
  title: string,
  find: (prefix: string) => Promise<{ slug: string | null }[]>,
) {
  const base = slugBase(title);
  // Serialize allocation per resource, including competing titles such as "story" and "story-2".
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'website.slug.' + resource}))`;
  return availableSlug(
    base,
    (await find(base)).map((row) => row.slug),
  );
}
