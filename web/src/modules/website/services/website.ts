import { cache } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getApiBaseUrl } from "@/lib/api/client";
import {
  websiteTag,
  type Content,
  type PageSection,
  type Collection,
} from "./content";
export { formatDate } from "./content";
export const sections = {
  about: ["About", "Our school", "Get to know our school community."],
  academics: [
    "Academics",
    "Academics",
    "Explore our classes and learning programmes.",
  ],
  facilities: [
    "Facilities",
    "Campus facilities",
    "Spaces and resources for learning.",
  ],
  notices: [
    "Notices",
    "Notice board",
    "Announcements for students and families.",
  ],
  events: ["Events", "School events", "Discover what’s happening at school."],
  gallery: ["Gallery", "School gallery", "Photographs from school life."],
  careers: ["Careers", "Careers", "Current openings at our school."],
  contact: ["Contact", "Contact us", "Get in touch with the school office."],
} as const;
export const fallbackName = "Pathivara Vidhya Mandir";
export interface Profile {
  nameEn: string;
  nameNp: string | null;
  taglineEn: string | null;
  district: string | null;
  localLevel: string | null;
  tole: string | null;
  wardNo: number | null;
  province: string | null;
  addressLineNp: string | null;
  hasLogo: boolean;
  email: string | null;
  establishedOn: string | null;
}
interface Envelope<T> {
  data: T;
  meta?: { totalPages: number };
}
async function read<T>(
  path: string,
  tag: string,
  detail = false,
): Promise<Envelope<T> | null> {
  await connection();
  let response: Response;
  try {
    response = await fetch(getApiBaseUrl() + path, {
      credentials: "omit",
      cache: "force-cache",
      next: { tags: [websiteTag(tag)], revalidate: 60 },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return null;
  }
  if (detail && response.status === 404) notFound();
  if (!response.ok) return null;
  return response.json();
}
export const getProfile = cache(
  async () => (await read<Profile | null>("/website/profile", "profile"))?.data,
);
export const getClasses = () =>
  read<{ name: string }[]>("/website/classes", "classes");
export const getEntries = (section: PageSection) =>
  read<Content[]>("/public/website/entries?section=" + section, "entries");
export const listContent = (resource: Collection, query = "") =>
  read<Content[]>("/public/website/" + resource + query, resource);
export const getContent = cache((resource: Collection, slug: string) =>
  read<Content>(
    "/public/website/" + resource + "/" + encodeURIComponent(slug),
    resource,
    true,
  ),
);
