import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { DashboardShell } from "./DashboardShell";
import { modulesForPermissions } from "./Navigation";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/settings/academic-year",
}));

it("keeps permitted modules visible while showing the active module's sections", () => {
  const modules = modulesForPermissions(["academic-years:read", "portal:access"]);
  const html = renderToStaticMarkup(
    <DashboardShell modules={modules} user={{ displayName: "Member", roleLabel: "Member" }}>
      <p>Academic year workspace</p>
    </DashboardShell>,
  );
  expect(html).toContain("Academics");
  expect(html).toContain("Family Portal");
  expect(html).toContain("Academic years");
  expect(html).toContain('aria-current="page"');
  expect(html).not.toContain("Family balance");
  expect(html).not.toContain("Classes &amp; sections");
  expect(html).not.toContain("Administration");
});
