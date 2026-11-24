import { getApiBaseUrl } from "@/lib/api/client";
export const collections = ["notices", "events", "gallery", "careers"] as const;
export type Collection = (typeof collections)[number];
export const pageSections = [
  "home",
  "about",
  "academics",
  "facilities",
] as const;
export type PageSection = (typeof pageSections)[number];
export const categories = [
  "general",
  "exam",
  "holiday",
  "admission",
  "result",
  "event",
] as const;
export const applicationStatuses = [
  "received",
  "shortlisted",
  "interviewed",
  "offered",
  "rejected",
];
export const inquiryStatuses = ["unread", "in_progress", "resolved", "spam"];
export interface Photo {
  id: string;
  imageUrl: string;
  caption?: string | null;
  altText?: string | null;
}
export interface Content {
  id: string;
  slug: string;
  title: string;
  createdAt: string;
  published: boolean;
  section?: PageSection;
  subtitle?: string | null;
  summary?: string | null;
  body?: string;
  description?: string | null;
  imageUrl?: string | null;
  imageAlt?: string | null;
  coverImage?: string | null;
  attachmentUrl?: string | null;
  category?: string;
  isPinned?: boolean;
  publishedAt?: string | null;
  expiresAt?: string | null;
  startsAt?: string;
  endsAt?: string | null;
  venue?: string | null;
  isAllDay?: boolean;
  isFeatured?: boolean;
  eventDate?: string | null;
  photos?: Photo[];
  deadline?: string | null;
  department?: string | null;
  employmentType?: string;
  vacancies?: number;
  qualification?: string | null;
  experience?: string | null;
  sortOrder?: number;
  metadata?: Record<string, unknown> | null;
}
export function assetUrl(value?: string | null) {
  if (!value) return undefined;
  if (/^\/api\/v1\/public\/website\/files\/[a-f0-9-]+\.(png|pdf)$/.test(value))
    return new URL(value, getApiBaseUrl()).href;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}
export function formatDate(value: string, withTime = false) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kathmandu",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(value));
}
export const displayName = (value: string) => value.replaceAll("_", " ");
export const websiteTag = (resource: string) => "school-website-" + resource;
