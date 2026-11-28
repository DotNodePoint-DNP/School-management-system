"use client";
import "@fontsource/noto-sans-devanagari/400.css";
import "@fontsource/noto-sans-devanagari/700.css";
import { useState } from "react";
import TemplateDesigner from "./TemplateDesigner";
import DocumentOffice from "./DocumentOffice";

import NotificationTemplateMaster from "@/modules/settings/components/NotificationTemplateMaster";
export default function DocumentWorkspace({
  permissions,
  office,
}: {
  permissions: string[];
  office?: "create" | "register";
}) {
  const has = (key: string) => permissions.includes(key);
  const tabs = [
    ...(has("documents:design") || has("documents:publish")
      ? ["Template designer"]
      : []),
    ...(has("school:manage") ? ["Notifications"] : []),
  ];
  const [tab, setTab] = useState(tabs[0]);
  return (
    <main className="document-workspace mx-auto max-w-7xl space-y-5 p-5">
      <h1 className="text-2xl font-bold">
        {office === "create"
          ? "Create document"
          : office === "register"
            ? "Issued register"
            : "Document templates"}
      </h1>
      {!office && tabs.length > 1 && (
        <nav className="flex flex-wrap gap-2 border-b pb-3">
          {tabs.map((t) => (
            <button
              aria-pressed={!office && tab === t}
              onClick={() => setTab(t)}
              key={t}
            >
              {t}
            </button>
          ))}
        </nav>
      )}
      {!office && tab === "Template designer" && (
        <TemplateDesigner
          design={has("documents:design")}
          publish={has("documents:publish")}
        />
      )}
      {office && (
        <DocumentOffice
          key={office}
          registerOnly={office === "register"}
          canSign={has("documents:print-signed")}
        />
      )}
      {!office && tab === "Notifications" && <NotificationTemplateMaster />}
      <style>{`.document-workspace label{display:block;font-size:.9rem}.document-workspace :is(select,textarea,input:not([type=checkbox],[type=color])){display:block;border:1px solid #c6cfcf;padding:.35rem .5rem;border-radius:4px;max-width:100%}.document-workspace button{border:1px solid #98adac;padding:.35rem .65rem;border-radius:4px}.document-workspace button[aria-pressed=true]{background:#115e59;color:white}.document-workspace button:disabled{opacity:.5}.document-workspace h3{font-weight:650}`}</style>
    </main>
  );
}
