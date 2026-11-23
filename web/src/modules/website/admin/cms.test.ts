import { describe, expect, it, vi } from "vitest";
import { editorialPayload, fieldValue } from "./cms";
import { assetUrl } from "../services/content";
import { hasDashboardAccess } from "@/core/authorization/dashboard-access";
describe("website CMS", () => {
  it("round-trips Nepal event times from the admin editor", () => {
    const form = new FormData();
    form.set("startsAt", "2026-11-23T09:30");
    form.set("endsAt", "2026-11-23T10:15");
    const payload = editorialPayload("events", form);
    expect(payload.startsAt).toBe("2026-11-23T03:45:00.000Z");
    expect(
      fieldValue(
        { key: "endsAt", label: "Ends", type: "datetime-local" },
        { id: "test", ...payload },
      ),
    ).toBe("2026-11-23T10:15");
  });
  it("sends explicit empty values when clearing a pinned notice and its attachment", () => {
    const payload = editorialPayload("notices", new FormData());
    expect(payload.isPinned).toBe(false);
    expect(payload.attachmentUrl).toBe(null);
  });
  it("resolves uploaded files against the API origin", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://school-api.example.org/api/v1");
    try {
      expect(assetUrl("/api/v1/public/website/files/abcd.png")).toBe(
        "https://school-api.example.org/api/v1/public/website/files/abcd.png",
      );
      expect(assetUrl("javascript:alert(1)")).toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("restricts the CMS dashboard to school managers", () => {
    expect(hasDashboardAccess("/dashboard/website", ["school:manage"])).toBe(
      true,
    );
    expect(
      hasDashboardAccess("/dashboard/website", ["school:manage-signatories"]),
    ).toBe(false);
  });
});
