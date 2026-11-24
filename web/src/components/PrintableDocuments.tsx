"use client";

import { createPortal } from "react-dom";
import Image from "next/image";
import { isRecord, RecordDetails, humanLabel } from "./RecordDetails";

export function PrintableDocuments({
  batch,
}: {
  batch: Record<string, unknown>;
}) {
  const documents = Array.isArray(batch.documents) ? batch.documents : [];
  const assets = isRecord(batch.assets) ? batch.assets : {};
  const school = isRecord(batch.school) ? batch.school : {};
  const signatories = Array.isArray(batch.signatories)
    ? batch.signatories.filter(isRecord)
    : [];
  const pages = documents.map((document, i) => {
    const copy =
      isRecord(document) && isRecord(document.copy) ? document.copy : null;
    const section =
      isRecord(document) && isRecord(document.section)
        ? document.section
        : null;
    const teacher =
      section && isRecord(batch.classTeachers)
        ? batch.classTeachers[String(section.id)]
        : null;
    const signatures = isRecord(teacher)
      ? [...signatories, teacher]
      : signatories;
    return (
      <article
        className="school-print-page rounded-xl border border-line bg-panel p-5 sm:p-8"
        key={i}
      >
        <header className="mb-5 border-b border-line pb-4">
          {typeof assets.logo === "string" && (
            <Image
              unoptimized
              width={64}
              height={64}
              src={assets.logo}
              alt="School logo"
              className="mb-3 h-14 w-auto"
            />
          )}
          <strong>{String(school.nameEn ?? school.name ?? "")}</strong>
          <h2 className="text-xl font-semibold">
            {humanLabel(String(batch.kind ?? "Document"))}
          </h2>
          {batch.variant === "PARENT_COPY" && <p>Parent copy</p>}
          {copy && (
            <p className="font-semibold">
              {copy.kind === "ORIGINAL"
                ? "Original"
                : "Duplicate copy " + String(copy.number)}
            </p>
          )}
          {isRecord(batch.issuedOn) && (
            <p className="text-sm">Issued {String(batch.issuedOn.ad)}</p>
          )}
        </header>
        <RecordDetails value={document} />
        <footer className="mt-8 flex flex-wrap justify-between gap-5">
          {typeof assets.seal === "string" && (
            <Image
              unoptimized
              width={72}
              height={72}
              src={assets.seal}
              alt="School seal"
              className="size-16 object-contain"
            />
          )}
          {signatures.map((s, i) => (
            <div key={i}>
              {s.mode === "DIGITAL" &&
                batch.variant !== "PARENT_COPY" &&
                typeof s.assetKey === "string" &&
                typeof assets[s.assetKey] === "string" && (
                  <Image
                    unoptimized
                    width={140}
                    height={54}
                    className="h-12"
                    alt="Signature"
                    src={String(assets[s.assetKey])}
                  />
                )}
              <div className="mt-5 border-t pt-1">{String(s.nameEn ?? "")}</div>
              <small>{String(s.designationEn ?? "")}</small>
            </div>
          ))}
        </footer>
      </article>
    );
  });
  return (
    <div className="space-y-4">
      {Array.isArray(batch.warnings) &&
        batch.warnings.map((v, i) => <p key={i}>{String(v)}</p>)}
      {pages.length > 0 && (
        <button
          type="button"
          className="min-h-11 rounded-lg bg-navy px-5 text-white"
          onClick={() => window.print()}
        >
          Print or save PDF
        </button>
      )}
      {pages}
      {Array.isArray(batch.skipped) && batch.skipped.length > 0 && (
        <section>
          <h3>Skipped records</h3>
          <RecordDetails value={batch.skipped} />
        </section>
      )}
      {typeof document !== "undefined" &&
        createPortal(
          <div className="school-print-copy">{pages}</div>,
          document.body,
        )}
      <style>
        {
          ".school-print-copy{display:none}@media print{body:has(>.school-print-copy)>:not(.school-print-copy){display:none!important}.school-print-copy{display:block;color:#111;background:white}.school-print-page{border:0;break-after:page}.school-print-page:last-child{break-after:auto}}"
        }
      </style>
    </div>
  );
}
