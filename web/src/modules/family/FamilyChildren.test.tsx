import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { FamilyOverview } from "./FamilyOverview";
import FamilyChildren from "./FamilyChildren";

it("shows the linked child's profile even when a previously selected child is no longer linked", () => {
  const client = new QueryClient();
  client.setQueryData(["family", "selectedChild"], "old-link");
  client.setQueryData(["family", "home"], {
    guardian: { name: "Guardian" },
    children: [
      {
        id: "child",
        name: "Riya Rai",
        admissionNo: "A-12",
        current: null,
        fees: null,
        attendance: null,
        latestResult: null,
      },
    ],
  });
  client.setQueryData(["family", "old-link", "profile"], {
    name: "Other child",
  });
  client.setQueryData(["family", "child", "profile"], {
    name: "Riya Rai",
    gender: "FEMALE",
    status: "ACTIVE",
    admissionNo: "A-12",
    dateOfBirth: "2015-03-05",
    admissionDate: "2024-04-15",
    guardians: [],
    enrollments: [
      {
        enrollmentId: "past",
        academicYear: { name: "2081" },
        className: "Grade 4",
        sectionName: "A",
        rollNo: 2,
        status: "COMPLETED",
      },
    ],
  });
  const html = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <FamilyChildren />
    </QueryClientProvider>,
  );
  expect(html).toContain("Riya Rai");
  expect(html).toContain("Student photo placeholder");
  expect(html).toContain("Grade 4");
  expect(html).toContain("Balance unavailable");
  expect(html).not.toContain("Other child");
  expect(html).not.toContain("Manage student record");
  client.clear();
});

it("links fee payments and results to the intended sibling, including admission numbers with special characters", () => {
  const client = new QueryClient();
  const siblings = [
    { id: "one", admissionNo: "A/1", name: "Riya Rai" },
    { id: "two", admissionNo: "A & 2", name: "Suman Rai" },
  ].map((c) => ({
    ...c,
    current: null,
    fees: { outstanding: 1000 },
    attendance: null,
    latestResult: null,
  }));
  client.setQueryData(["family", "home"], {
    guardian: { name: "Maya Rai" },
    fees: { outstanding: 2000, overdue: 0, credit: 0 },
    children: siblings,
  });
  const render = (node: React.ReactNode) =>
    renderToStaticMarkup(
      <QueryClientProvider client={client}>{node}</QueryClientProvider>,
    );
  const overview = render(<FamilyOverview />);
  expect(overview).toContain("student=A%2F1&amp;view=fees");
  expect(overview).toContain("student=A+%26+2&amp;view=results");
  expect(render(<FamilyChildren student="A & 2" view="fees" />)).toContain(
    "Pay by school QR",
  );
  client.setQueryData(
    ["family", "two", "results"],
    [
      {
        enrollmentId: "enr",
        academicYear: { name: "2083" },
        exam: { id: "term", name: "Second term" },
        status: "PASS",
        percentage: 87,
      },
    ],
  );
  const results = render(<FamilyChildren student="A & 2" view="results" />);
  expect(results).toContain("Second term");
  expect(results).toContain("87%");
  expect(results).not.toContain("Pay by school QR");
  const unavailable = render(<FamilyChildren student="unlinked" view="fees" />);
  expect(unavailable).toContain("This student is unavailable");
  expect(unavailable).not.toContain("Pay by school QR");
  client.clear();
});
