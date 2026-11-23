import { createApiClient } from "@/lib/api/client";
import { categories, pageSections } from "../services/content";
export const tabs = {
  entries: "Page sections",
  notices: "Notices",
  events: "Events",
  gallery: "Gallery",
  careers: "Careers",
  "job-applications": "Applications",
  "contact-submissions": "Inquiries",
} as const;
export type Tab = keyof typeof tabs;
export type EditorialTab = Exclude<
  Tab,
  "job-applications" | "contact-submissions"
>;
export type CmsRow = { id: string; [field: string]: unknown };
export const str = (row: CmsRow | undefined, key: string) =>
  row?.[key] == null ? "" : String(row[key]);
export const adminWrite = createApiClient("/api/website-admin");
export async function loadRows(resource: Tab) {
  const api = createApiClient(),
    rows: CmsRow[] = [];
  for (let page = 1; ; page++) {
    const result = await api.getPaginated<CmsRow>(
      "/admin/website/" + resource + "?limit=100&page=" + page,
    );
    rows.push(...result.items);
    if (page >= result.meta.totalPages) return rows;
  }
}
export async function uploadFile(file: File, kind: "pdf" | "image") {
  if (file.size > 5 * 1024 * 1024)
    throw Error("Choose a file of 5 MB or less.");
  if (!(kind === "pdf" ? /\.pdf$/i : /\.(png|jpe?g)$/i).test(file.name))
    throw Error(
      kind === "pdf" ? "Choose a PDF document." : "Choose a JPEG or PNG image.",
    );
  const form = new FormData();
  form.set("file", file);
  return (await adminWrite.post<{ url: string }>("/files", form)).url;
}
export interface Field {
  key: string;
  label: string;
  type?:
    | "text"
    | "area"
    | "image"
    | "pdf"
    | "number"
    | "checkbox"
    | "date"
    | "datetime-local"
    | "select"
    | "json";
  required?: boolean;
  choices?: readonly string[];
  initial?: string;
}
const title: Field = { key: "title", label: "Title", required: true },
  body: Field = { key: "body", label: "Body", type: "area", required: true },
  description: Field = {
    key: "description",
    label: "Description",
    type: "area",
    required: true,
  };
const image: Field = { key: "imageUrl", label: "Image", type: "image" },
  cover: Field = { ...image, key: "coverImage", label: "Cover image" },
  alt: Field = { key: "imageAlt", label: "Image description" };
const sort: Field = {
  key: "sortOrder",
  label: "Display order",
  type: "number",
  initial: "0",
};
export const fields: Record<EditorialTab, Field[]> = {
  entries: [
    { key: "section", label: "Page", type: "select", choices: pageSections },
    title,
    { key: "subtitle", label: "Subtitle" },
    body,
    image,
    alt,
    sort,
    { key: "metadata", label: "Metadata (JSON object)", type: "json" },
  ],
  notices: [
    title,
    { key: "category", label: "Category", type: "select", choices: categories },
    { key: "summary", label: "Summary", type: "area" },
    body,
    { key: "isPinned", label: "Pin this notice", type: "checkbox" },
    {
      key: "expiresAt",
      label: "Expires at (Nepal time)",
      type: "datetime-local",
    },
    image,
    alt,
    { key: "attachmentUrl", label: "PDF attachment", type: "pdf" },
  ],
  events: [
    title,
    { key: "summary", label: "Summary", type: "area" },
    description,
    {
      key: "startsAt",
      label: "Starts at (Nepal time)",
      type: "datetime-local",
      required: true,
    },
    { key: "endsAt", label: "Ends at (Nepal time)", type: "datetime-local" },
    { key: "venue", label: "Venue" },
    { key: "isAllDay", label: "All-day event", type: "checkbox" },
    { key: "isFeatured", label: "Featured event", type: "checkbox" },
    cover,
    alt,
  ],
  gallery: [
    title,
    { ...description, required: false },
    { key: "eventDate", label: "Album date", type: "date" },
    cover,
    alt,
    sort,
  ],
  careers: [
    title,
    { key: "department", label: "Department" },
    {
      key: "employmentType",
      label: "Employment type",
      type: "select",
      choices: ["full_time", "part_time", "contract", "internship"],
    },
    {
      key: "vacancies",
      label: "Number of vacancies",
      type: "number",
      initial: "1",
    },
    { key: "deadline", label: "Application deadline", type: "date" },
    { key: "qualification", label: "Qualifications", type: "area" },
    { key: "experience", label: "Experience", type: "area" },
    description,
    image,
    alt,
  ],
};
export function fieldValue(field: Field, row?: CmsRow) {
  const value = row?.[field.key];
  if (value == null) return field.initial ?? "";
  if (field.type === "date") return String(value).slice(0, 10);
  if (field.type === "datetime-local")
    return new Date(new Date(String(value)).getTime() + 345 * 60000)
      .toISOString()
      .slice(0, 16);
  if (field.type === "json") return JSON.stringify(value, null, 2);
  return String(value);
}
export function editorialPayload(resource: EditorialTab, form: FormData) {
  const data: Record<string, unknown> = {};
  for (const f of fields[resource]) {
    const value = String(form.get(f.key) ?? "").trim();
    if (f.type === "checkbox") data[f.key] = form.has(f.key);
    else if (f.type === "number") data[f.key] = Number(value || f.initial);
    else if (!value) data[f.key] = null;
    else if (f.type === "datetime-local")
      data[f.key] = new Date(value + "+05:45").toISOString();
    else if (f.type === "json") {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw Error("Metadata must be a JSON object.");
      data[f.key] = parsed;
    } else data[f.key] = value;
  }
  if (
    data.startsAt &&
    data.endsAt &&
    String(data.endsAt) < String(data.startsAt)
  )
    throw Error("End time must be on or after the start.");
  return data;
}
