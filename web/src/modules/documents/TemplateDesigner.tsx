"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createApiClient } from "@/lib/api/client";
import { Surface, PrintSheets } from "./DocumentPrint";
import {
  fieldLabels,
  starterKinds,
  type StarterName,
  type Kind,
  type Side,
  type Block,
  type Layout,
  type Template,
  starter,
  sample,
  textBlock,
  tokens,
  size,
} from "./layout";
export default function TemplateDesigner({
  design,
  publish,
}: {
  design: boolean;
  publish: boolean;
}) {
  const api = createApiClient();
  const queryClient = useQueryClient();
  const templates = useQuery({
    queryKey: ["document-templates"],
    queryFn: () => api.get<Template[]>("/documents/templates"),
  });
  const [id, setId] = useState(""),
    [rev, setRev] = useState(0),
    [title, setTitle] = useState("Official letter");
  const [kind, setKind] = useState<Kind>("OFFICIAL_LETTER"),
    [layout, setLayout] = useState<Layout>(() =>
      starter("OFFICIAL_LETTER", "Official letter"),
    );
  const [side, setSide] = useState<Side>("front"),
    [index, setIndex] = useState(0),
    [dirty, setDirty] = useState(true);
  const [busy, setBusy] = useState(false),
    [msg, setMsg] = useState(""),
    [proof, setProof] = useState(false);
  const [language, setLanguage] = useState<"EN" | "NP" | "BOTH">("EN");
  const [preset, setPreset] = useState<StarterName | "">("Official letter");
  const [baseline, setBaseline] = useState(() =>
    JSON.stringify([title, layout]),
  );
  function discardEdits() {
    return (
      JSON.stringify([title, layout]) === baseline ||
      window.confirm("Discard unsaved changes to this draft?")
    );
  }
  const front = useQuery({
    queryKey: ["art", layout.frontArt],
    enabled: !!layout.frontArt,
    queryFn: () =>
      api.get<{ image: string }>("/documents/artwork/" + layout.frontArt),
  });
  const back = useQuery({
    queryKey: ["art", layout.backArt],
    enabled: !!layout.backArt,
    queryFn: () =>
      api.get<{ image: string }>("/documents/artwork/" + layout.backArt),
  });
  const assets = {
    frontArt: front.data?.image ?? "",
    backArt: back.data?.image ?? "",
  };
  const block = layout.blocks[index];
  function change(next: Partial<Layout>) {
    setLayout({ ...layout, ...next });
    setDirty(true);
    setProof(false);
  }
  function edit(next: Partial<Block>) {
    change({
      blocks: layout.blocks.map((b, i) =>
        i === index ? { ...b, ...next } : b,
      ),
    });
  }
  function load(row: Template) {
    setPreset("");
    setLanguage(row.draft.language ?? "EN");
    setBaseline(JSON.stringify([row.title, row.draft]));
    setId(row.id);
    setRev(row.revision);
    setTitle(row.title);
    setKind(row.kind);
    setLayout(row.draft);
    setIndex(0);
    setSide("front");
    setDirty(false);
    setMsg("");
    setProof(false);
  }
  function selectStarter(name: StarterName, lang: typeof language) {
    if (!discardEdits()) return;
    const k = starterKinds[name];
    const l = starter(k, name, lang);
    setPreset(name);
    setLanguage(lang);
    setBaseline(JSON.stringify([name, l]));
    setId("");
    setRev(0);
    setTitle(name);
    setKind(k);
    setLayout(l);
    setIndex(0);
    setSide("front");
    setDirty(true);
    setProof(false);
    setMsg("");
  }
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setMsg("");
    try {
      await fn();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    const data = { title, kind, layout, revision: rev || undefined };
    const row = id
      ? await api.put<Template>("/documents/templates/" + id, data)
      : await api.post<Template>("/documents/templates", data);
    load(row);
    await templates.refetch();
    setMsg("Draft saved.");
  }
  const previewStudent = {
    ...sample,
    values: {
      ...sample.values,
      serial:
        layout.prefix +
        "-" +
        (layout.serialYear === "BS" ? "2083" : "2026") +
        "-00001",
      office:
        layout.language === "NP"
          ? "विद्यालयको अभिलेखअनुसार विद्यार्थीको आचरण प्रशंसनीय छ।"
          : sample.values.office,
    },
  };
  const dimensions = size(kind, layout);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label>
          Saved drafts
          <select
            disabled={busy}
            value={id}
            onChange={(e) => {
              const t = templates.data?.find((r) => r.id === e.target.value);
              if (t && discardEdits()) load(t);
            }}
          >
            <option value="">Choose template</option>
            {templates.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title} · revision {t.revision}
              </option>
            ))}
          </select>
        </label>
        {design && (
          <>
            <label>
              Starter
              <select
                disabled={busy}
                value={preset}
                onChange={(e) =>
                  selectStarter(e.target.value as StarterName, language)
                }
              >
                <option value="" disabled>
                  Choose a new starter
                </option>
                {Object.keys(starterKinds).map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Starter language
              <select
                value={language}
                disabled={busy || !preset}
                onChange={(e) =>
                  preset &&
                  selectStarter(preset, e.target.value as typeof language)
                }
              >
                <option value="EN">English</option>
                <option value="NP">नेपाली</option>
                <option value="BOTH">English + नेपाली</option>
              </select>
            </label>

            <button
              disabled={busy || !id}
              onClick={() => {
                setId("");
                setRev(0);
                setTitle(title + " (copy)");
                setDirty(true);
              }}
            >
              Duplicate
            </button>
          </>
        )}
      </div>
      {templates.error && <p role="alert">{templates.error.message}</p>}
      <fieldset disabled={!design || busy} className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <label>
            Template name
            <input
              maxLength={100}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setDirty(true);
              }}
            />
          </label>
          <details>
            <summary>Numbering and print settings</summary>
            {layout.letter && (
              <label>
                Letterhead language
                <select
                  value={layout.language ?? "EN"}
                  onChange={(e) =>
                    change({ language: e.target.value as Layout["language"] })
                  }
                >
                  <option value="EN">English</option>
                  <option value="NP">नेपाली</option>
                  <option value="BOTH">English + नेपाली</option>
                </select>
              </label>
            )}
            {kind !== "OFFICIAL_LETTER" && (
              <label>
                Orientation
                <select
                  value={layout.orientation}
                  onChange={(e) => {
                    const orientation = e.target.value as Layout["orientation"];
                    const next = size(kind, { ...layout, orientation });
                    const sx = next.width / dimensions.width,
                      sy = next.height / dimensions.height;
                    const round = (n: number) => Math.floor(n * 100) / 100;
                    change({
                      orientation,
                      blocks: layout.blocks.map((b) => ({
                        ...b,
                        x: round(b.x * sx),
                        y: round(b.y * sy),
                        width: round(b.width * sx),
                        height: round(b.height * sy),
                      })),
                    });
                  }}
                >
                  <option>portrait</option>
                  <option>landscape</option>
                </select>
              </label>
            )}
            <label>
              Serial prefix
              <input
                value={layout.prefix}
                maxLength={16}
                onChange={(e) => change({ prefix: e.target.value })}
              />
            </label>
            <label>
              Signatory slot
              <input
                list="document-slots"
                value={layout.signatorySlot ?? "PRINCIPAL"}
                onChange={(e) => change({ signatorySlot: e.target.value })}
              />
              <datalist id="document-slots">
                <option>PRINCIPAL</option>
                <option>EXAM_CONTROLLER</option>
                <option>ACCOUNTANT</option>
              </datalist>
            </label>
            <label>
              Serial year
              <select
                value={layout.serialYear}
                onChange={(e) =>
                  change({ serialYear: e.target.value as Layout["serialYear"] })
                }
              >
                <option>BS</option>
                <option>AD</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={layout.nepaliDigits}
                onChange={(e) => change({ nepaliDigits: e.target.checked })}
              />{" "}
              Nepali date and roll digits
            </label>
          </details>
        </div>
      </fieldset>
      {layout.letter ? (
        <fieldset disabled={!design || busy} className="space-y-3">
          <label>
            Default subject
            <input
              maxLength={240}
              value={layout.letter.subject}
              onChange={(e) =>
                change({
                  letter: { ...layout.letter!, subject: e.target.value },
                })
              }
            />
          </label>
          <label>
            Default message
            <textarea
              className="w-full"
              rows={7}
              maxLength={16000}
              value={layout.letter.body}
              onChange={(e) =>
                change({ letter: { ...layout.letter!, body: e.target.value } })
              }
            />
          </label>
          <label>
            Insert field into message
            <select
              value=""
              onChange={(e) =>
                change({
                  letter: {
                    ...layout.letter!,
                    body: layout.letter!.body + "{{" + e.target.value + "}}",
                  },
                })
              }
            >
              <option value="">Choose field</option>
              {tokens
                .filter((t) => t !== "office")
                .map((t) => (
                  <option key={t} value={t}>
                    {fieldLabels[t]}
                  </option>
                ))}
            </select>
          </label>
        </fieldset>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <fieldset disabled={!design || busy} className="space-y-2">
              {layout.blocks.map(
                (b, i) =>
                  b.type === "text" && (
                    <label key={i}>
                      {b.label ??
                        (b.side === "back" ? "Back" : "Front") +
                          " wording " +
                          (i + 1)}
                      <textarea
                        className="w-full"
                        value={b.text}
                        maxLength={2000}
                        onChange={(e) =>
                          change({
                            blocks: layout.blocks.map((v, j) =>
                              j === i ? { ...v, text: e.target.value } : v,
                            ),
                          })
                        }
                      />
                    </label>
                  ),
              )}
            </fieldset>
            <DesignPreview
              key={id || preset}
              record={previewStudent}
              kind={kind}
              layout={layout}
              assets={assets}
            />
          </div>
          <details
            key={id || preset}
            open={layout.blocks.length === 0 || undefined}
          >
            <summary>Advanced layout</summary>
            <div className="flex flex-wrap gap-2">
              <strong>
                {dimensions.width} × {dimensions.height} mm
              </strong>
              {kind === "ID_CARD" &&
                (["front", "back"] as const).map((s) => (
                  <button
                    key={s}
                    aria-pressed={side === s}
                    onClick={() => {
                      setSide(s);
                      setIndex(layout.blocks.findIndex((b) => b.side === s));
                    }}
                  >
                    {s}
                  </button>
                ))}
            </div>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="overflow-auto rounded bg-slate-100 p-4">
                <Surface
                  kind={kind}
                  layout={layout}
                  record={previewStudent}
                  assets={assets}
                  side={side}
                  guide
                  active={index}
                  onSelect={setIndex}
                />
              </div>
              <fieldset disabled={!design || busy} className="space-y-3">
                <label>
                  Background artwork · PNG or JPEG
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file)
                        void action(async () => {
                          const form = new FormData();
                          form.append("file", file);
                          const a = await api.post<{ id: string }>(
                            "/documents/artwork",
                            form,
                          );
                          change({ [side + "Art"]: a.id });
                        });
                    }}
                  />
                </label>
                <button onClick={() => change({ [side + "Art"]: undefined })}>
                  Remove artwork
                </button>
                <label>
                  <input
                    type="checkbox"
                    checked={layout.printArt}
                    onChange={(e) => change({ printArt: e.target.checked })}
                  />{" "}
                  Print artwork (clear for preprinted stationery)
                </label>
                <div>
                  <button
                    onClick={() => {
                      const b = {
                        ...textBlock("{{name}}", 3, 3, 45, 12, 10),
                        side,
                      };
                      change({ blocks: [...layout.blocks, b] });
                      setIndex(layout.blocks.length);
                    }}
                  >
                    Add block
                  </button>
                  {block && (
                    <button
                      onClick={() => {
                        change({
                          blocks: layout.blocks.filter((_, i) => i !== index),
                        });
                        setIndex(-1);
                      }}
                    >
                      Remove block
                    </button>
                  )}
                </div>
                {block && block.side === side && (
                  <>
                    <label>
                      Field label
                      <input
                        maxLength={100}
                        value={block.label ?? ""}
                        onChange={(e) =>
                          edit({ label: e.target.value || undefined })
                        }
                      />
                    </label>
                    <label>
                      Block type
                      <select
                        value={block.type}
                        onChange={(e) =>
                          edit({ type: e.target.value as Block["type"] })
                        }
                      >
                        {["text", "photo", "logo", "seal", "signature"].map(
                          (t) => (
                            <option key={t}>{t}</option>
                          ),
                        )}
                      </select>
                    </label>
                    {block.type === "text" && (
                      <>
                        <label>
                          Wording
                          <textarea
                            rows={4}
                            value={block.text}
                            onChange={(e) => edit({ text: e.target.value })}
                          />
                        </label>
                        <label>
                          Insert field
                          <select
                            value=""
                            onChange={(e) =>
                              edit({
                                text: block.text + "{{" + e.target.value + "}}",
                              })
                            }
                          >
                            <option value="">Select field</option>
                            {[...tokens, "leavingDateBs", "destination"].map(
                              (t) => (
                                <option key={t}>{t}</option>
                              ),
                            )}
                          </select>
                        </label>
                      </>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      {(["x", "y", "width", "height", "points"] as const).map(
                        (k) => (
                          <label key={k}>
                            {k === "points" ? "Font (pt)" : k + " (mm)"}
                            <input
                              type="number"
                              step="0.1"
                              value={block[k]}
                              onChange={(e) =>
                                edit({ [k]: Number(e.target.value) })
                              }
                            />
                          </label>
                        ),
                      )}
                    </div>
                    <label>
                      Text colour
                      <input
                        type="color"
                        value={block.color}
                        onChange={(e) => edit({ color: e.target.value })}
                      />
                    </label>
                    <label>
                      Alignment
                      <select
                        value={block.align}
                        onChange={(e) =>
                          edit({ align: e.target.value as Block["align"] })
                        }
                      >
                        <option>left</option>
                        <option>center</option>
                        <option>right</option>
                      </select>
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={block.bold}
                        onChange={(e) => edit({ bold: e.target.checked })}
                      />{" "}
                      Bold
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={block.required}
                        onChange={(e) => edit({ required: e.target.checked })}
                      />{" "}
                      Require data before issuing
                    </label>
                  </>
                )}
              </fieldset>
            </div>
          </details>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {design && (
          <button disabled={busy || !dirty} onClick={() => void action(save)}>
            Save draft
          </button>
        )}
        {publish && (
          <button
            disabled={busy || dirty || !id}
            onClick={() =>
              void action(async () => {
                await api.post("/documents/templates/" + id + "/publish", {
                  revision: rev,
                });
                await templates.refetch();
                await queryClient.invalidateQueries({
                  queryKey: ["document-versions"],
                });
                setMsg("Revision " + rev + " published.");
              })
            }
          >
            Publish saved revision
          </button>
        )}
        <button onClick={() => setProof(!proof)}>
          {proof ? "Close proof" : "Show print proof"}
        </button>
      </div>
      {(msg || front.error || back.error) && (
        <p role="status">
          {msg || front.error?.message || back.error?.message}
        </p>
      )}
      {id && (
        <p>
          Published revisions:{" "}
          {templates.data
            ?.find((t) => t.id === id)
            ?.versions.map((v) => v.revision)
            .join(", ") || "None"}
        </p>
      )}
      {proof && (
        <PrintSheets
          proof
          batch={{
            kind,
            layout,
            assets,
            documents: [
              layout.letter
                ? {
                    ...previewStudent,
                    values: {
                      ...previewStudent.values,
                      ...layout.letter,
                      recipient: "Ward Office / वडा कार्यालय",
                    },
                  }
                : previewStudent,
            ],
            skipped: [],
            warnings: [],
            proof: "",
          }}
        />
      )}
    </div>
  );
}

function DesignPreview({
  kind,
  layout,
  assets,
  record,
}: {
  record: typeof sample;
  kind: Kind;
  layout: Layout;
  assets: Record<string, string>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(280);
  const [side, setSide] = useState<Side>("front");
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setAvailable(entry.contentRect.width),
    );
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const { width, height } = size(kind, layout);
  const mm = 96 / 25.4;
  const scale = Math.min(1, available / (width * mm), 440 / (height * mm));
  const hasBack =
    kind === "ID_CARD" &&
    (!!layout.backArt || layout.blocks.some((b) => b.side === "back"));
  const face = hasBack ? side : "front";
  return (
    <section className="min-w-0 space-y-2 rounded-md bg-slate-100 p-3">
      <header className="flex items-center gap-2">
        <h3>Sample preview</h3>
        {hasBack &&
          (["front", "back"] as const).map((s) => (
            <button
              type="button"
              key={s}
              aria-pressed={face === s}
              onClick={() => setSide(s)}
            >
              {s === "front" ? "Front" : "Back"}
            </button>
          ))}
      </header>
      <div ref={host} style={{ height: height * mm * scale }}>
        <div
          style={{
            width: width + "mm",
            transform: "scale(" + scale + ")",
            transformOrigin: "top left",
          }}
        >
          <Surface
            kind={kind}
            layout={layout}
            assets={assets}
            record={record}
            side={face}
            guide
          />
        </div>
      </div>
    </section>
  );
}
