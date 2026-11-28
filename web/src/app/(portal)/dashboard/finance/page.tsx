import Link from "next/link";
import { requireDashboardPage } from "@/core/session/server";
import { financeSections } from "@/modules/finance/sections";

const groups = [
  {
    name: "Collections",
    sections: ["qr-payments", "payments", "invoices", "student-fees"],
  },
  {
    name: "Reporting and follow-up",
    sections: ["reports", "late-fees", "reminders", "documents"],
  },
  {
    name: "School fee setup",
    sections: ["billing", "fee-heads", "fiscal-years"],
  },
];
const descriptions: Record<string, string> = {
  "qr-payments": "Review transfer evidence and manage the school QR.",
  payments: "Record collections, find receipts and view student statements.",
  invoices: "Issue invoices and review adjustments.",
  "student-fees": "Manage student charges and discounts.",
  reports: "Check collections, outstanding dues and day close.",
  "late-fees": "Review fine policies, previews and posted fines.",
  reminders: "Prepare fee reminders and check delivery.",
  documents: "Print receipts, invoices, statements and vouchers.",
  billing: "Configure billing periods and class fee structures.",
  "fee-heads": "Manage the charges that appear on invoices.",
  "fiscal-years": "Manage accounting years and closing dates.",
};
export default async function Page() {
  const user = await requireDashboardPage("/dashboard/finance");
  const visible = financeSections.filter((s) =>
    s.permissions.some((p) => user.permissions.includes(p)),
  );
  return (
    <main className="mx-auto max-w-6xl space-y-8 text-ink">
      <h1 className="text-3xl font-semibold">Finance</h1>
      {groups.map((group) => {
        const entries = group.sections.flatMap((slug) =>
          visible.filter((s) => s.slug === slug),
        );
        return (
          entries.length > 0 && (
            <section key={group.name}>
              <h2 className="mb-3 text-lg font-semibold">{group.name}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {entries.map((s) => (
                  <Link
                    key={s.slug}
                    href={"/dashboard/finance/" + s.slug}
                    className="group rounded-xl border border-line bg-panel p-5 hover:border-ink focus-visible:outline-2"
                  >
                    <span className="flex justify-between font-semibold">
                      {s.label}
                      <span aria-hidden="true">→</span>
                    </span>
                    <p className="mt-2 text-sm text-muted">
                      {descriptions[s.slug]}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )
        );
      })}
    </main>
  );
}
