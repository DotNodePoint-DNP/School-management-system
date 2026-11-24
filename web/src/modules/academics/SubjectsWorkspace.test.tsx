import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import SubjectsWorkspace from "./SubjectsWorkspace";

it("shows saved class subjects separately from the school catalog before editing", () => {
  const client = new QueryClient();
  client.setQueryData(["academic-years"], [{ id: "year", name: "2083", status: "ACTIVE" }]);
  client.setQueryData(["school-classes"], [{ id: "seven", name: "Grade 7" }]);
  const maths = { id: "maths", code: "MAT", name: "Mathematics", isActive: true };
  client.setQueryData(["subjects"], [maths, { ...maths, id: "art", code: "ART", name: "Fine Arts" }]);
  client.setQueryData(["curriculum", "year", "seven"], {
    academicYearId: "year", classId: "seven",
    subjects: [{ ...maths, subjectId: maths.id, isCompulsory: true, creditHours: 4 }],
  });
  const html = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <SubjectsWorkspace permissions={["subjects:read", "subjects:manage"]} />
    </QueryClientProvider>,
  );
  const savedList = html.match(/<section aria-label="Saved class subjects"[^>]*>([\s\S]*?)<\/section>/)?.[1];
  expect(savedList).toContain("Grade 7 subjects");
  expect(savedList).toContain("Mathematics");
  expect(savedList).toContain("Compulsory");
  expect(savedList).toContain("4 credit hours");
  expect(savedList).not.toContain("Fine Arts");
  expect(html).toContain("Edit curriculum");
  expect(html).not.toContain('type="checkbox"');
  client.clear();
});
