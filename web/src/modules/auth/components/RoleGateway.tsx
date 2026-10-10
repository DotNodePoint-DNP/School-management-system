"use client";

import Link from "next/link";
import { roleDetails, roles } from "@/core/authorization/roles";

export function RoleGateway() {
  return (
    <main className="flex min-h-screen flex-col bg-[#f4f0e8] px-[7vw] text-[#183d3b] max-[700px]:px-[22px]">
      <div className="py-8">
        <Link href="/">
          <span className="grid h-[30px] w-[30px] rotate-[-10deg] place-items-center rounded-[50%_50%_50%_4px] bg-[#edbd63] font-[700_20px_Georgia,serif]">
            n
          </span>
          <span className="[&_strong]:block [&_strong]:font-[600_16px_Georgia,serif] [&_small]:mt-0.5 [&_small]:block [&_small]:text-[8px] [&_small]:uppercase [&_small]:tracking-[.2em] [&_small]:text-[#71817e]">
            <strong>Pathivara</strong>
            <small>Academy</small>
          </span>
        </Link>
      </div>
      <section className="mx-auto w-full max-w-[1060px] flex-1 py-[65px] max-[700px]:py-[45px]">
        <div className="mb-[55px] flex items-end justify-between gap-10 max-[700px]:mb-[38px] max-[700px]:block">
          <div>
            <p className="mb-4 text-[9px] font-semibold uppercase tracking-[.15em] text-[#b27b3d]">
              Pathivara vidhya mandir portal
            </p>
            <h1 className="m-0 font-[400_clamp(58px,7vw,99px)/.86_Georgia,serif] tracking-[-.07em] max-[700px]:text-[64px]">
              Where do you
              <br />
              <em className="text-[#bc8748]">belong?</em>
            </h1>
          </div>
          <p className="mb-1 max-w-[245px] text-[12px] leading-[1.7] text-[#71817e] max-[700px]:mt-6">
            Choose your workspace to continue to a sign-in experience tailored
            to your role.
          </p>
        </div>
        <div
          className="grid grid-cols-2 gap-[13px] max-[700px]:grid-cols-1"
          aria-label="Choose your Pathivara role"
        >
          {roles.map((role) => {
            const detail = roleDetails[role];
            return (
              <Link
                className="group flex min-h-[155px] items-center gap-[18px] rounded border border-[#d8d9cd] bg-white/40 px-[25px] py-[22px] text-[#183d3b] no-underline transition hover:-translate-y-1 hover:border-[#b8bcae] hover:bg-[#fffaf0] max-[700px]:min-h-[125px]"
                href={`/auth/login/${role}`}
                key={role}
              >
                <span
                  className={`grid h-[120px] w-[120px] shrink-0 place-items-center rounded-full text-[23px] ${detail.accent === "teal" ? "bg-[#d5ebe3] text-[#167d72]" : detail.accent === "navy" ? "bg-[#dce6e4] text-[#315a5b]" : detail.accent === "amber" ? "bg-[#f9e7bd] text-[#ae792b]" : "bg-[#f5dcd2] text-[#b36a58]"}`}
                >
                  <span
                    aria-hidden="true"
                    className="text-current [&_svg]:h-[120px] [&_svg]:w-[120px] [&_svg]:fill-none"
                    dangerouslySetInnerHTML={{ __html: detail.icon }}
                  />
                </span>
                <span className="flex-1 [&_strong]:block [&_strong]:font-[400_28px_Georgia,serif] [&_small]:mt-2 [&_small]:block [&_small]:max-w-[260px] [&_small]:text-[14px] [&_small]:leading-[1.5] [&_small]:text-[#75827e]">
                  <strong>{detail.label}</strong>
                  <small>{detail.description}</small>
                </span>
                <span className="self-start text-[18px] text-[#ad7b40]">↗</span>
              </Link>
            );
          })}
        </div>
        <p className="mt-[26px] text-[10px] text-[#82908c]">
          Having trouble signing in?{" "}
          <a href="mailto:support@pathivara.example">Contact portal support</a>
        </p>
      </section>
      <div className="flex items-center justify-between border-t border-[#d9dbd0] py-[18px] pb-6 text-[9px] text-[#87938e] max-[700px]:flex-wrap max-[700px]:gap-3 max-[700px]:[&>span:nth-child(2)]:hidden">
        <span>Pathivara vidhya mandir</span>
        <span>Secure school portal</span>
        <Link href="/">Back to website ↗</Link>
      </div>
    </main>
  );
}
