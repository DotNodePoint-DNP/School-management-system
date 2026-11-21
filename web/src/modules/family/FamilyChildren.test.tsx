import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import FamilyChildren from "./FamilyChildren";

it("shows the linked child's profile even when a previously selected child is no longer linked", () => {
  const client = new QueryClient();
  client.setQueryData(["family", "selectedChild"], "old-link");
  client.setQueryData(["family", "home"], {
    guardian: { name: "Guardian" }, children: [{ id: "child", name: "Riya Rai",
      admissionNo: "A-12", current: null, fees: null, attendance: null, latestResult: null }],
  });
  client.setQueryData(["family", "old-link", "profile"], { name: "Other child" });
  client.setQueryData(["family", "child", "profile"], {
    name: "Riya Rai", gender: "FEMALE", status: "ACTIVE", admissionNo: "A-12",
    dateOfBirth: "2015-03-05", admissionDate: "2024-04-15", guardians: [],
    enrollments: [{ enrollmentId: "past", academicYear: { name: "2081" },
      className: "Grade 4", sectionName: "A", rollNo: 2, status: "COMPLETED" }],
  });
  const html = renderToStaticMarkup(
    <QueryClientProvider client={client}><FamilyChildren /></QueryClientProvider>,
  );
  expect(html).toContain("Riya Rai");
  expect(html).toContain("Student photo placeholder");
  expect(html).toContain("Grade 4");
  expect(html).toContain("Balance unavailable");
  expect(html).not.toContain("Other child");
  expect(html).not.toContain("Manage student record");
  client.clear();
});
