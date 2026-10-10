"use client";
import { useState } from "react";
import { fullName, npr, pretty ,type Student } from "../student";

const tabs = [
  "Overview",
  "Academic",
  "Guardians",
  "Fees",
  "Transport & library",
] as const;

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">
        {value ?? <span className="text-muted">Not provided</span>}
      </dd>
    </div>
  );
}
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-panel p-5">
      <h3 className="mb-4 text-sm font-semibold text-ink">{title}</h3>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
        {children}
      </dl>
    </section>
  );
}

export function StudentProfile({ s }: { s: Student }) {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");
  const p = s.personalInformation,
    a = s.academicRecord,
    f = s.financialLedger,
    g = s.guardianDetails;
  const addr = (x: Student["addressDetails"]["permanentAddress"]) =>
    `${x.tole}, Ward ${x.wardNumber}, ${x.localBody}, ${x.district}`;
  const monthly =
    f.totalMonthlyFee * (1 - f.scholarshipDiscountPercentage / 100);

  return (
    <div className="space-y-5">
      {/* Identity header: always visible, whichever tab is open */}
      <header className="flex flex-wrap items-center gap-5 rounded-xl bg-navy p-5 text-white">
        <div className="grid size-16 place-items-center rounded-full bg-teal text-xl font-semibold">
          {p.firstName[0]}
          {p.lastName[0]}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">{fullName(s)}</h1>
            <span className="rounded-full bg-mint px-2 py-0.5 text-xs text-teal">
              {pretty(s.status)}
            </span>
          </div>
          <p className="mt-1 text-sm text-white/70">
            {a.class} – {a.section} · Roll {a.rollNumber} · {s.studentId} ·
            Session {s.academicSession}
          </p>
        </div>
        <div className="flex gap-6 text-sm">
          <div>
            <p className="text-white/60">GPA</p>
            <p className="text-lg font-semibold">
              {a.termEvaluation.gpaObtained}
            </p>
          </div>
          <div>
            <p className="text-white/60">Attendance</p>
            <p className="text-lg font-semibold">
              {a.termEvaluation.attendanceDays}
            </p>
          </div>
          <div>
            <p className="text-white/60">Fee due</p>
            <p className="text-lg font-semibold text-amber">
              {npr(f.dueBalanceNpr)}
            </p>
          </div>
        </div>
      </header>

      <div
        role="tablist"
        className="flex gap-1 overflow-x-auto border-b border-line"
      >
        {tabs.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm ${tab === t ? "border-teal font-medium text-teal" : "border-transparent text-muted hover:text-ink"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <>
          <Section title="Personal information">
            <Field label="Gender" value={pretty(p.gender)} />
            <Field label="Date of birth (AD)" value={p.dateOfBirthAD} />
            <Field label="Date of birth (BS)" value={p.dateOfBirthBS} />
            <Field label="Blood group" value={pretty(p.bloodGroup)} />
            <Field label="Mother tongue" value={p.motherTongue} />
            <Field label="Category" value={p.ethnicityCasteCategory} />
            <Field label="National ID" value={p.nationalIdentityNumber} />
            <Field label="Citizenship no." value={p.citizenshipNumber} />
            <Field label="Symbol no." value={s.symbolNumber} />
            <Field label="Registration no." value={s.registrationNumber} />
          </Section>
          <Section title="Address">
            <Field
              label="Permanent"
              value={addr(s.addressDetails.permanentAddress)}
            />
            <Field
              label="Temporary"
              value={addr(s.addressDetails.temporaryAddress)}
            />
          </Section>
        </>
      )}

      {tab === "Academic" && (
        <>
          <Section title="Class details">
            <Field label="Class" value={`${a.class} – ${a.section}`} />
            <Field label="Roll number" value={a.rollNumber} />
            <Field label="Class teacher" value={a.classTeacher.name} />
            <Field label="Latest exam" value={a.termEvaluation.examName} />
            <Field label="Grade" value={a.termEvaluation.grade} />
          </Section>
          <section className="overflow-x-auto rounded-xl border border-line bg-panel">
            <table className="w-full text-left text-sm">
              <thead className="text-muted">
                <tr className="border-b border-line">
                  <th className="px-5 py-2 font-normal">Subject</th>
                  <th className="px-5 py-2 font-normal">Code</th>
                  <th className="px-5 py-2 text-right font-normal">
                    Credit hours
                  </th>
                </tr>
              </thead>
              <tbody>
                {a.subjects.map((x) => (
                  <tr
                    key={x.subjectCode}
                    className="border-b border-line last:border-0"
                  >
                    <td className="px-5 py-2.5 text-ink">{x.subjectName}</td>
                    <td className="px-5 py-2.5 text-muted">{x.subjectCode}</td>
                    <td className="px-5 py-2.5 text-right text-ink">
                      {x.creditHours.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      {tab === "Guardians" && (
        <>
          {(["father", "mother"] as const).map((k) => (
            <Section key={k} title={k === "father" ? "Father" : "Mother"}>
              <Field label="Name" value={g[k].name} />
              <Field label="Occupation" value={g[k].occupation} />
              <Field label="Phone" value={g[k].contactPhone} />
              <Field label="Email" value={g[k].email} />
            </Section>
          ))}
          <Section title="SMS notifications">
            <Field
              label="Primary contact"
              value={pretty(g.primaryContactForSms)}
            />
            <Field label="SMS number" value={g.smsNotificationPhone} />
          </Section>
        </>
      )}

      {tab === "Fees" && (
        <>
          <Section title="Fee summary">
            <Field label="Monthly fee" value={npr(f.totalMonthlyFee)} />
            <Field label="Bus fee" value={npr(f.busFee)} />
            <Field
              label="Scholarship"
              value={`${f.scholarshipType} (${f.scholarshipDiscountPercentage}%)`}
            />
            <Field label="Monthly after discount" value={npr(monthly)} />
            <Field
              label="Due balance"
              value={
                <span className="font-semibold text-coral">
                  {npr(f.dueBalanceNpr)}
                </span>
              }
            />
            <Field label="Status" value={pretty(f.paymentStatus)} />
          </Section>
          <section className="rounded-xl border border-line bg-panel p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">
                Recent payments
              </h3>
              <button className="rounded-md bg-teal px-3 py-1.5 text-sm text-white hover:opacity-90">
                Collect payment
              </button>
            </div>
            {f.recentTransactions.map((t) => (
              <div
                key={t.receiptNo}
                className="flex flex-wrap justify-between gap-2 border-t border-line py-3 text-sm first:border-0"
              >
                <span className="text-ink">
                  {t.receiptNo} · {t.dateBS}
                </span>
                <span className="text-muted">
                  {t.paymentMethod} · {t.transactionId}
                </span>
                <span className="font-medium text-ink">
                  {npr(t.amountPaid)}
                </span>
              </div>
            ))}
            <p className="mt-3 text-xs text-muted">
              Accepted: {f.allowedPaymentGateways.join(", ")}
            </p>
          </section>
        </>
      )}

      {tab === "Transport & library" && (
        <>
          <Section title="School bus">
            <Field
              label="Uses bus"
              value={s.schoolOperations.transport.usesSchoolBus ? "Yes" : "No"}
            />
            <Field
              label="Route"
              value={s.schoolOperations.transport.busRouteNo}
            />
            <Field
              label="Pickup point"
              value={s.schoolOperations.transport.pickupPoint}
            />
            <Field
              label="Driver phone"
              value={s.schoolOperations.transport.driverPhone}
            />
          </Section>
          <Section title="Library">
            <Field label="Card no." value={s.schoolOperations.library.cardNo} />
            <Field
              label="Books issued"
              value={s.schoolOperations.library.issuedBooksCount}
            />
            <Field
              label="Fine"
              value={npr(s.schoolOperations.library.fineAmountNpr)}
            />
          </Section>
        </>
      )}

      <p className="text-xs text-muted">
        Created {s.auditInfo.createdDateBS} (BS) · Last updated{" "}
        {new Date(s.auditInfo.lastUpdated).toLocaleDateString("en-GB")}
      </p>
    </div>
  );
}
