"use client";
import Image from "next/image";
import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import {
  size,
  substitute,
  sheetPositions,
  type Batch,
  type Side,
  type Layout,
  type Kind,
  type PrintRecord,
} from "./layout";

export function Surface({
  kind,
  layout,
  record,
  assets,
  side,
  guide = false,
  onSelect,
  active,
}: {
  kind: Kind;
  layout: Layout;
  record: PrintRecord;
  assets: Record<string, string>;
  side: Side;
  guide?: boolean;
  onSelect?: (i: number) => void;
  active?: number;
}) {
  const { width, height } = size(kind, layout);
  const art = assets[side + "Art"];
  return (
    <div
      style={{
        position: "relative",
        width: width + "mm",
        height: height + "mm",
        background: "white",
        overflow: "hidden",
        outline: "0.15mm solid #999",
        fontFamily: "'Noto Sans Devanagari', 'Nirmala UI', sans-serif",
        color: "#111",
        boxSizing: "border-box",
      }}
    >
      {art && (guide || layout.printArt) && (
        <Image
          unoptimized
          width={1}
          height={1}
          src={art}
          alt=""
          style={{ position: "absolute", width: "100%", height: "100%" }}
        />
      )}
      {layout.blocks.map((b, i) => {
        if (b.side !== side) return null;
        const src = b.type === "photo" ? record.photo : assets[b.type];
        return (
          <div
            key={i}
            data-print-block=""
            onClick={() => onSelect?.(i)}
            style={{
              position: "absolute",
              left: b.x + "mm",
              top: b.y + "mm",
              width: b.width + "mm",
              height: b.height + "mm",
              lineHeight: 1.25,
              fontSize: b.points + "pt",
              textAlign: b.align,
              fontWeight: b.bold ? 700 : 400,
              color: b.color,
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              overflow: "hidden",
              outline: onSelect
                ? active === i
                  ? "2px solid teal"
                  : "1px dotted #999"
                : undefined,
              cursor: onSelect ? "pointer" : undefined,
            }}
          >
            {b.type === "text" ? (
              substitute(b.text, record.values)
            ) : src ? (
              <Image
                unoptimized
                width={1}
                height={1}
                alt=""
                src={src}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: b.type === "photo" ? "cover" : "contain",
                }}
              />
            ) : b.type === "signature" ? (
              <div
                style={{
                  height: "90%",
                  borderBottom: "1px solid currentColor",
                }}
              />
            ) : guide ? (
              <small>{b.type}</small>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
function OfficialLetter({
  batch,
  record,
  proof,
}: {
  batch: Batch;
  record: PrintRecord;
  proof: boolean;
}) {
  const v = record.values,
    lang = batch.layout.language ?? "EN";
  const label = (en: string, np: string) =>
    lang === "NP" ? np : lang === "BOTH" ? np + " / " + en : en;
  const localized = (en: string, np: string) =>
    lang === "NP"
      ? np || en
      : lang === "BOTH"
        ? [np, en].filter(Boolean).join("\n")
        : en || np;
  return (
    <article
      className="official-letter"
      style={{
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
        fontFamily: "'Noto Sans Devanagari', sans-serif",
        lineHeight: 1.65,
        color: "#172626",
        background: "white",
      }}
    >
      {proof && (
        <p>
          <strong>{label("DRAFT", "मस्यौदा")}</strong>
        </p>
      )}
      <header
        style={{
          textAlign: "center",
          borderBottom: "1px solid #777",
          paddingBottom: "4mm",
        }}
      >
        {batch.assets.logo && (
          <Image
            unoptimized
            width={68}
            height={68}
            alt=""
            src={batch.assets.logo}
            style={{ margin: "auto", objectFit: "contain" }}
          />
        )}
        <h2 style={{ fontSize: "18pt", fontWeight: 700 }}>
          {localized(v.schoolEn, v.schoolNp)}
        </h2>
        <p>{localized(v.addressEn, v.addressNp)}</p>
        <p>{[v.phone, v.identifiers].filter(Boolean).join(" · ")}</p>
      </header>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          margin: "6mm 0",
        }}
      >
        <span>
          {label("Ref.", "पत्र सङ्ख्या")} {v.serial}
        </span>
        <span>
          {v.issueBs} BS · {v.issueAd} AD
        </span>
      </div>
      <p>{v.recipient}</p>
      <h3 style={{ margin: "5mm 0", fontWeight: 700 }}>
        {label("Subject", "विषय")} · {substitute(v.subject, v)}
      </h3>
      <div>{substitute(v.body, v)}</div>
      <footer style={{ breakInside: "avoid", marginTop: "10mm" }}>
        {batch.assets.signature ? (
          <Image
            unoptimized
            src={batch.assets.signature}
            width={120}
            height={50}
            alt=""
            style={{ objectFit: "contain" }}
          />
        ) : (
          <div
            style={{ width: "40mm", height: "12mm", borderBottom: "1px solid" }}
          />
        )}
        <p>{localized(v.signer, v.signerNp)}</p>
        <p>{localized(v.designation, v.designationNp)}</p>
        {batch.assets.seal && (
          <Image
            unoptimized
            src={batch.assets.seal}
            width={60}
            height={60}
            alt=""
          />
        )}
      </footer>
    </article>
  );
}
export function PrintSheets({
  batch,
  proof = false,
}: {
  batch: Batch;
  proof?: boolean;
}) {
  const [single, setSingle] = useState(false);
  const [message, setMessage] = useState("");
  const [printing, setPrinting] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const { width, height } = size(batch.kind, batch.layout);
  const sheet = batch.kind === "ID_CARD" && !single;
  const cols = sheet ? Math.floor(195 / width) : 1,
    rows = sheet ? Math.floor(282 / height) : 1;
  const per = cols * rows;
  const back =
    batch.layout.blocks.some((b) => b.side === "back") ||
    !!batch.layout.backArt;
  const pages = [];
  for (let i = 0; i < batch.documents.length; i += per) {
    const group = batch.documents.slice(i, i + per);
    if (batch.kind === "OFFICIAL_LETTER") {
      pages.push(
        <OfficialLetter
          key={i}
          batch={batch}
          record={group[0]}
          proof={proof}
        />,
      );
      continue;
    }
    for (const side of (back ? ["front", "back"] : ["front"]) as Side[]) {
      const positions = sheetPositions(group.length, cols, side === "back");
      pages.push(
        <div
          className="issued-sheet"
          key={i + side}
          style={{
            width: (sheet ? 210 : width) + "mm",
            height: (sheet ? 297 : height) + "mm",
            display: "grid",
            gridTemplateColumns: "repeat(" + cols + "," + width + "mm)",
            gridTemplateRows: "repeat(" + rows + "," + height + "mm)",
            alignContent: "center",
            justifyContent: "center",
            background: "white",
            breakInside: "avoid",
            position: "relative",
          }}
        >
          {group.map((r, j) => (
            <div
              key={r.enrollmentId}
              style={{
                gridColumn: positions[j].column,
                gridRow: positions[j].row,
              }}
            >
              <Surface
                kind={batch.kind}
                layout={batch.layout}
                assets={batch.assets}
                side={side}
                record={r}
              />
            </div>
          ))}
          {proof && (
            <strong
              style={{
                position: "absolute",
                top: "45%",
                left: "33%",
                opacity: 0.45,
                fontSize: "22pt",
                transform: "rotate(-20deg)",
              }}
            >
              SAMPLE
            </strong>
          )}
          {proof && (
            <span
              style={{
                position: "absolute",
                bottom: "4mm",
                left: "6mm",
                width: "30mm",
                borderBottom: "0.3mm solid black",
                color: "black",
                fontSize: "8pt",
              }}
            >
              30 mm
            </span>
          )}
        </div>,
      );
    }
  }
  async function print() {
    setPrinting(true);
    setMessage("");
    try {
      await Promise.all(
        Array.from(root.current?.querySelectorAll("img") ?? [], (img) =>
          img.decode(),
        ),
      );
      await document.fonts.ready;
      const clipped = Array.from(
        root.current?.querySelectorAll<HTMLElement>("[data-print-block]") ?? [],
      ).some(
        (el) =>
          el.scrollHeight > el.clientHeight + 1 ||
          el.scrollWidth > el.clientWidth + 1,
      );
      if (clipped) {
        setMessage(
          "Text exceeds its block. Enlarge the block or reduce the font before printing.",
        );
        return;
      }
      window.print();
    } catch {
      setMessage("An image could not load. Reload this proof and retry.");
    } finally {
      setPrinting(false);
    }
  }
  return (
    <section className="space-y-3">
      {batch.kind === "ID_CARD" && (
        <label>
          <input
            type="checkbox"
            checked={single}
            onChange={(e) => setSingle(e.target.checked)}
          />{" "}
          One card per page
        </label>
      )}
      <p className="text-sm">
        {batch.kind !== "OFFICIAL_LETTER" && "Check the 30 mm line on a proof."}{" "}
        Print at 100% scale with browser headers and footers off.
        {sheet && back ? " For two-sided cards use long-edge duplex." : ""}
      </p>
      <button disabled={!pages.length || printing} onClick={() => void print()}>
        {proof ? "Print proof" : "Print or save PDF"}
      </button>
      {message && <p role="alert">{message}</p>}
      <div className="overflow-auto max-h-[60vh] bg-slate-100 p-3" ref={root}>
        {pages}
      </div>
      {typeof document !== "undefined" &&
        createPortal(
          <div className="issued-print-root">{pages}</div>,
          document.body,
        )}
      <style>{`.official-letter{width:210mm;min-height:297mm;padding:16mm}.issued-print-root{display:none}.issued-sheet{print-color-adjust:exact;-webkit-print-color-adjust:exact}@media print{@page{size:${sheet ? "210mm 297mm" : width + "mm " + height + "mm"};margin:${batch.kind === "OFFICIAL_LETTER" ? "16mm" : "0"}} .official-letter{width:auto;min-height:0;padding:0} body:has(>.issued-print-root)>*:not(.issued-print-root){display:none!important}body:has(>.issued-print-root)>.issued-print-root{display:block!important}.issued-sheet:not(:last-child){break-after:page}}`}</style>
    </section>
  );
}
