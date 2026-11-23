import { revalidateTag } from "next/cache";
import { getApiBaseUrl } from "@/lib/api/client";
import { sameOriginRequest } from "@/lib/api/auth-server";
import { websiteTag } from "@/modules/website/services/content";

type Context = { params: Promise<{ path: string[] }> };
const resources = new Set([
  "entries",
  "notices",
  "events",
  "gallery",
  "careers",
  "files",
  "job-applications",
  "contact-submissions",
]);
async function mutate(request: Request, { params }: Context) {
  const { path } = await params;
  if (
    !resources.has(path[0]) ||
    path.length > 4 ||
    !path.every((segment) => /^[a-z0-9-]+$/i.test(segment))
  )
    return new Response(null, { status: 404 });
  if (!sameOriginRequest(request)) return new Response(null, { status: 403 });
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer "))
    return new Response(null, { status: 401 });
  const init: RequestInit & { duplex: "half" } = {
    method: request.method,
    headers: {
      Authorization: authorization,
      "Content-Type": request.headers.get("content-type") ?? "application/json",
    },
    body: request.body,
    duplex: "half",
    cache: "no-store",
    redirect: "error",
  };
  const upstream = await fetch(
    getApiBaseUrl() + "/admin/website/" + path.join("/"),
    init,
  );
  if (upstream.ok) revalidateTag(websiteTag(path[0]), { expire: 0 });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
export const POST = mutate;
export const PATCH = mutate;
export const DELETE = mutate;
