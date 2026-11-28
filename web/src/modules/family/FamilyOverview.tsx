"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  Wallet,
  CalendarDays,
  UserRound,
} from "lucide-react";
import {
  Failure,
  buttonClass,
  primaryClass,
} from "@/components/ui/WorkspaceFields";
import { familyHome } from "./services/portal";
import { childHref, familyPath, formatNpr } from "./family-navigation";

export function FamilyOverview() {
  const home = useQuery({
    queryKey: ["family", "home"],
    queryFn: familyHome,
    refetchInterval: 60000,
  });
  return (
    <section className="mx-auto max-w-5xl space-y-6 text-ink">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Family dashboard</h1>
          {home.data && (
            <p className="mt-1 text-muted">{home.data.guardian.name}</p>
          )}
        </div>
        <Link
          href={familyPath + "/account"}
          className={buttonClass + " inline-flex items-center gap-2"}
        >
          <UserRound size={16} aria-hidden />
          My account
        </Link>
      </header>
      <Failure error={home.error} retry={() => void home.refetch()} />
      {home.isPending && <p role="status">Loading your family dashboard…</p>}
      {home.data && (
        <>
          <section className="rounded-2xl bg-navy p-5 text-white sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-medium">
                  Family outstanding balance
                </h2>
                <p className="mt-1 text-3xl font-semibold tabular-nums">
                  {formatNpr(home.data.fees.outstanding)}
                </p>
              </div>
              <Link
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/60 px-4 font-medium hover:bg-white/10"
                href={familyPath + "/balance"}
              >
                View balance <ArrowRight size={16} aria-hidden />
              </Link>
            </div>
            <p className="mt-4 border-t border-white/25 pt-3 text-sm">
              Overdue {formatNpr(home.data.fees.overdue)} · Advance credit{" "}
              {formatNpr(home.data.fees.credit)}
            </p>
          </section>
          <section>
            <h2 className="mb-3 text-xl font-semibold">My children</h2>
            {!home.data.children.length && (
              <p className="rounded-xl border border-line p-4">
                No children are linked to this account. Contact the school
                office to link a student.
              </p>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              {home.data.children.map((c) => (
                <article
                  key={c.id}
                  className="flex flex-col gap-4 rounded-xl border border-line bg-panel p-5"
                >
                  <header>
                    <h3 className="text-xl font-semibold">{c.name}</h3>
                    <p className="text-sm text-muted">
                      {[
                        c.current?.className,
                        c.current?.sectionName,
                        "Admission " + c.admissionNo,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </header>
                  <dl className="grid grid-cols-2 gap-3 rounded-lg bg-background p-3 text-sm">
                    <div>
                      <dt className="text-muted">Outstanding fees</dt>
                      <dd className="mt-1 font-semibold">
                        {c.fees
                          ? formatNpr(c.fees.outstanding)
                          : "Balance unavailable"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Latest result</dt>
                      <dd className="mt-1 font-semibold">
                        {c.latestResult?.percentage != null
                          ? c.latestResult.percentage + "%"
                          : (c.latestResult?.status ?? "No released result")}
                      </dd>
                    </div>
                  </dl>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      aria-label={"Pay fees for " + c.name}
                      className={
                        primaryClass + " inline-flex items-center gap-2"
                      }
                      href={childHref(c.admissionNo, "fees")}
                    >
                      <Wallet size={16} aria-hidden />
                      Pay fees
                    </Link>
                    <Link
                      aria-label={"View results for " + c.name}
                      className={
                        buttonClass + " inline-flex items-center gap-2"
                      }
                      href={childHref(c.admissionNo, "results")}
                    >
                      <BookOpen size={16} aria-hidden />
                      View results
                    </Link>
                  </div>
                  <div className="flex flex-wrap gap-x-5 border-t border-line pt-1 text-sm font-medium">
                    <Link
                      className="inline-flex min-h-11 items-center gap-2 hover:underline"
                      href={childHref(c.admissionNo, "attendance")}
                    >
                      <CalendarDays size={15} aria-hidden />
                      Attendance
                    </Link>
                    <Link
                      className="inline-flex min-h-11 items-center hover:underline"
                      href={childHref(c.admissionNo, "payments")}
                    >
                      Receipts
                    </Link>
                    <Link
                      className="inline-flex min-h-11 items-center hover:underline"
                      href={childHref(c.admissionNo, "profile")}
                    >
                      Profile
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </section>
  );
}
