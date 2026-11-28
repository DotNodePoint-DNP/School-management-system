"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createApiClient } from "@/lib/api/client";
import { PrintSheets } from "./DocumentPrint";
import type { Batch, PublishedVersion, LetterText, Kind } from "./layout";
interface Option {
  id: string;
  name: string;
}
interface Student extends Option {
  admissionNo: string;
  status: string;
  roll: number | null;
}
interface Entry extends Option {
  admissionNo: string;
  serial: string;
  enrollmentId: string | null;
  reason: string | null;
  replacesId: string | null;
  replacedBy: { serial: string } | null;
  batch: { versionId: string; version: { title: string } };
}
export default function DocumentOffice({
  canSign,
  registerOnly = false,
}: {
  canSign: boolean;
  registerOnly?: boolean;
}) {
  const api = createApiClient();
  const queryClient = useQueryClient();
  const versions = useQuery({
    queryKey: ["document-versions"],
    queryFn: () => api.get<PublishedVersion[]>("/documents/versions"),
  });
  const options = useQuery({
    queryKey: ["document-office-options"],
    queryFn: () =>
      api.get<{
        signatories: { slot: string; fullNameEn: string }[];
        years: Option[];
        sections: (Option & { schoolClass: { name: string } })[];
      }>("/documents/options"),
  });
  const [version, setVersion] = useState(""),
    [year, setYear] = useState(""),
    [section, setSection] = useState("");
  const [ids, setIds] = useState<string[]>([]),
    [entryFields, setEntryFields] = useState<Record<string, string>>({}),
    [signed, setSigned] = useState(false);
  const [batch, setBatch] = useState<Batch | null>(null),
    [issued, setIssued] = useState(false),
    [request, setRequest] = useState("");
  const [busy, setBusy] = useState(false),
    [msg, setMsg] = useState(""),
    [search, setSearch] = useState(""),
    [term, setTerm] = useState("");
  const [original, setOriginal] = useState<Entry | null>(null),
    [reason, setReason] = useState("");
  const roster = useQuery({
    queryKey: ["document-roster", year, section],
    enabled: !!year && !!section,
    queryFn: () =>
      api.get<Student[]>(
        "/documents/roster?year=" + year + "&section=" + section,
      ),
  });
  const register = useQuery({
    enabled: registerOnly,
    queryKey: ["document-register", term],
    queryFn: () =>
      api.get<Entry[]>("/documents/register?q=" + encodeURIComponent(term)),
  });
  function clear() {
    setBatch(null);
    setIssued(false);
    setMsg("");
    setRequest("");
  }
  const [category, setCategory] = useState<Kind | null>(null);
  const available = (versions.data ?? []).filter(
    (v) =>
      !(versions.data ?? []).some(
        (other) =>
          other.templateId === v.templateId && other.revision > v.revision,
      ),
  );
  const selectedKind =
    category ??
    (available.some((v) => v.template.kind === "OFFICIAL_LETTER")
      ? "OFFICIAL_LETTER"
      : available[0]?.template.kind);
  const selectedVersion =
    version ||
    available.find((v) => v.template.kind === selectedKind)?.id ||
    "";
  const current = versions.data?.find((v) => v.id === selectedVersion);
  const isLetter = current?.template.kind === "OFFICIAL_LETTER";
  const [recipient, setRecipient] = useState(""),
    [wording, setWording] = useState<LetterText | null>(null),
    [slot, setSlot] = useState(""),
    [linkStudent, setLinkStudent] = useState(false);
  const letter = wording ?? current?.letter ?? { subject: "", body: "" };
  const displayVersions = (versions.data ?? []).filter(
    (v) =>
      v.id === selectedVersion ||
      (v.template.kind === selectedKind && available.includes(v)),
  );
  const input = {
    versionId: selectedVersion,
    enrollmentIds: original
      ? original.enrollmentId
        ? [original.enrollmentId]
        : []
      : ids,
    ...(isLetter
      ? {
          letter: {
            recipient,
            ...letter,
            signatorySlot: slot || current?.signatorySlot || "PRINCIPAL",
          },
        }
      : {}),
    ...Object.fromEntries(
      (current?.issueFields ?? [])
        .filter((f) => entryFields[f.key]?.trim())
        .map((f) => [f.key, entryFields[f.key].trim()]),
    ),
    signed,
    ...(original ? { replacesId: original.id, reason } : {}),
  };
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
  return (
    <div className="space-y-5">
      {(!registerOnly || original) && (
        <fieldset disabled={busy} className="space-y-3">
          {!original && (
            <label>
              Document type
              <select
                value={selectedKind ?? ""}
                onChange={(e) => {
                  setCategory(e.target.value as Kind);
                  setVersion("");
                  setEntryFields({});
                  setWording(null);
                  setRecipient("");
                  setSlot("");
                  setLinkStudent(false);
                  setIds([]);
                  clear();
                }}
              >
                {(["OFFICIAL_LETTER", "CERTIFICATE", "ID_CARD"] as const)
                  .filter((k) => available.some((v) => v.template.kind === k))
                  .map((k) => (
                    <option key={k} value={k}>
                      {
                        {
                          OFFICIAL_LETTER: "Official letter",
                          CERTIFICATE: "Certificate",
                          ID_CARD: "ID card",
                        }[k]
                      }
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label>
            Published template
            <select
              disabled={!!original}
              value={selectedVersion}
              onChange={(e) => {
                setVersion(e.target.value);
                setEntryFields({});
                setWording(null);
                setSlot("");
                setIds([]);
                setRecipient("");
                setLinkStudent(false);
                clear();
              }}
            >
              {displayVersions.map((v) => (
                <option value={v.id} key={v.id}>
                  {v.title} · revision {v.revision}
                </option>
              ))}
            </select>
          </label>
          {!versions.isPending && !versions.data?.length && (
            <p>Publish a template to enable issuance.</p>
          )}
          {isLetter && (
            <>
              <label>
                Recipient and address
                <textarea
                  value={recipient}
                  rows={2}
                  maxLength={500}
                  onChange={(e) => {
                    setRecipient(e.target.value);
                    clear();
                  }}
                />
              </label>
              <label>
                Subject
                <input
                  value={letter.subject}
                  maxLength={240}
                  onChange={(e) => {
                    setWording({ ...letter, subject: e.target.value });
                    clear();
                  }}
                />
              </label>
              <label>
                Message
                <textarea
                  className="w-full"
                  rows={8}
                  maxLength={16000}
                  value={letter.body}
                  onChange={(e) => {
                    setWording({ ...letter, body: e.target.value });
                    clear();
                  }}
                />
              </label>
              <label>
                Signatory
                <select
                  value={slot || current?.signatorySlot || "PRINCIPAL"}
                  onChange={(e) => {
                    setSlot(e.target.value);
                    clear();
                  }}
                >
                  {!options.data?.signatories.some(
                    (s) => s.slot === (current?.signatorySlot || "PRINCIPAL"),
                  ) && (
                    <option value={current?.signatorySlot || "PRINCIPAL"}>
                      Signature line · {current?.signatorySlot || "PRINCIPAL"}
                    </option>
                  )}
                  {options.data?.signatories.map((s) => (
                    <option key={s.slot} value={s.slot}>
                      {s.fullNameEn} · {s.slot}
                    </option>
                  ))}
                </select>
              </label>
              {!original && (
                <label>
                  <input
                    type="checkbox"
                    checked={linkStudent}
                    onChange={(e) => {
                      setLinkStudent(e.target.checked);
                      setIds([]);
                      clear();
                    }}
                  />{" "}
                  Link a student
                </label>
              )}
            </>
          )}
          {original ? (
            <div>
              <strong>
                Correct {original.serial} · {original.name}
              </strong>
              <label>
                Reason for replacement
                <input
                  value={reason}
                  maxLength={300}
                  onChange={(e) => {
                    setReason(e.target.value);
                    clear();
                  }}
                />
              </label>
              <button
                onClick={() => {
                  setOriginal(null);
                  setIds([]);
                  clear();
                }}
              >
                Cancel correction
              </button>
            </div>
          ) : (
            (!isLetter || linkStudent) && (
              <>
                <div className="flex flex-wrap gap-3">
                  <label>
                    Academic year
                    <select
                      value={year}
                      onChange={(e) => {
                        setYear(e.target.value);
                        setIds([]);
                        clear();
                      }}
                    >
                      <option value="">Choose year</option>
                      {options.data?.years.map((y) => (
                        <option value={y.id} key={y.id}>
                          {y.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Class and section
                    <select
                      value={section}
                      onChange={(e) => {
                        setSection(e.target.value);
                        setIds([]);
                        clear();
                      }}
                    >
                      <option value="">Choose section</option>
                      {options.data?.sections.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.schoolClass.name} · {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {year && section && (
                  <div>
                    {!isLetter && (
                      <button
                        onClick={() => {
                          setIds(
                            (roster.data ?? [])
                              .filter((s) => s.status === "ENROLLED")
                              .slice(0, 100)
                              .map((s) => s.id),
                          );
                          clear();
                        }}
                      >
                        Select enrolled students (up to 100)
                      </button>
                    )}{" "}
                    <button
                      onClick={() => {
                        setIds([]);
                        clear();
                      }}
                    >
                      Clear selection
                    </button>
                    <div className="max-h-52 overflow-y-auto">
                      {roster.data?.map((s) => (
                        <label key={s.id}>
                          <input
                            type="checkbox"
                            checked={ids.includes(s.id)}
                            disabled={!ids.includes(s.id) && ids.length >= 100}
                            onChange={(e) => {
                              setIds(
                                e.target.checked
                                  ? isLetter
                                    ? [s.id]
                                    : [...ids, s.id]
                                  : ids.filter((id) => id !== s.id),
                              );
                              clear();
                            }}
                          />{" "}
                          {s.roll ?? "–"} · {s.name} · {s.admissionNo} ·{" "}
                          {s.status}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )
          )}
          {!isLetter &&
            current?.issueFields?.map((f) => (
              <label key={f.key}>
                {f.label}
                {ids.length > 1 ? " (all selected students)" : ""}
                {f.key === "office" ? (
                  <textarea
                    maxLength={500}
                    value={entryFields.office ?? ""}
                    onChange={(e) => {
                      setEntryFields({
                        ...entryFields,
                        office: e.target.value,
                      });
                      clear();
                    }}
                  />
                ) : (
                  <input
                    placeholder={
                      f.key === "leavingDateBs" ? "YYYY-MM-DD" : undefined
                    }
                    maxLength={f.key === "leavingDateBs" ? 10 : 200}
                    value={entryFields[f.key] ?? ""}
                    onChange={(e) => {
                      setEntryFields({
                        ...entryFields,
                        [f.key]: e.target.value,
                      });
                      clear();
                    }}
                  />
                )}
              </label>
            ))}
          {canSign && (
            <label>
              <input
                type="checkbox"
                checked={signed}
                onChange={(e) => {
                  setSigned(e.target.checked);
                  clear();
                }}
              />{" "}
              Include authorized digital signature
            </label>
          )}
          <button
            disabled={
              !selectedVersion ||
              (isLetter
                ? !recipient.trim() ||
                  !letter.subject.trim() ||
                  !letter.body.trim() ||
                  (linkStudent && !input.enrollmentIds.length)
                : !input.enrollmentIds.length) ||
              (!!original && !reason.trim())
            }
            onClick={() =>
              void action(async () => {
                clear();
                setBatch(await api.post<Batch>("/documents/preview", input));
                setRequest(crypto.randomUUID());
              })
            }
          >
            {isLetter
              ? "Preview letter"
              : "Preview " + input.enrollmentIds.length + " selected"}
          </button>
        </fieldset>
      )}
      {[versions.error, options.error, roster.error, register.error].map(
        (e, i) =>
          e && (
            <p role="alert" key={i}>
              {e.message}
            </p>
          ),
      )}
      {msg && <p role="status">{msg}</p>}
      {batch && (
        <section className="space-y-2">
          <h3>
            {issued ? "Issued documents" : "Preview"} · {batch.documents.length}{" "}
            ready
          </h3>
          {batch.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
          {batch.skipped.map((s) => (
            <p key={s.enrollmentId}>
              {s.admissionNo ?? s.enrollmentId} · {s.reason}
            </p>
          ))}
          {!issued && (
            <button
              disabled={busy || !batch.documents.length}
              onClick={() =>
                void action(async () => {
                  await document.fonts.ready;
                  const overflow = Array.from(
                    document.querySelectorAll<HTMLElement>(
                      ".issued-sheet [data-print-block]",
                    ),
                  ).some(
                    (e) =>
                      e.clientWidth > 0 &&
                      (e.scrollHeight > e.clientHeight + 1 ||
                        e.scrollWidth > e.clientWidth + 1),
                  );
                  if (overflow)
                    throw new Error(
                      "Text exceeds its block. Adjust the template before issuing.",
                    );
                  setBatch(
                    await api.post<Batch>("/documents/issue", {
                      ...input,
                      requestId: request,
                      proof: batch.proof,
                    }),
                  );
                  setIssued(true);
                  setOriginal(null);
                  await queryClient.invalidateQueries({
                    queryKey: ["document-register"],
                  });
                  setMsg("Documents issued and recorded.");
                })
              }
            >
              {batch.kind === "OFFICIAL_LETTER"
                ? "Issue letter"
                : "Issue " + batch.documents.length + " documents"}
            </button>
          )}
          <PrintSheets batch={batch} proof={!issued} />
        </section>
      )}
      {registerOnly && (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setTerm(search);
            }}
            className="flex gap-2"
          >
            <input
              aria-label="Search issue register"
              value={search}
              placeholder="Recipient, name, admission number or serial"
              onChange={(e) => setSearch(e.target.value)}
            />
            <button>Search</button>
          </form>
          <div className="max-h-96 overflow-auto">
            {register.data?.length === 0 && <p>No issued documents found.</p>}
            {register.data?.map((row) => (
              <div
                className="flex flex-wrap gap-3 items-center border-b py-2"
                key={row.id}
              >
                <span>
                  {row.serial} · {row.name} · {row.batch.version.title}
                  {row.replacedBy
                    ? " · Superseded by " + row.replacedBy.serial
                    : ""}
                  {row.reason ? " · Correction: " + row.reason : ""}
                </span>
                <button
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      const copy = await api.get<Batch>(
                        "/documents/register/" + row.id,
                      );
                      setOriginal(null);
                      setBatch(copy);
                      setIssued(true);
                      setMsg(
                        row.replacedBy
                          ? "Historical copy · superseded by " +
                              row.replacedBy.serial
                          : "Issued copy loaded.",
                      );
                    })
                  }
                >
                  Open copy
                </button>
                {!row.replacedBy && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        const v = versions.data?.find(
                          (v) => v.id === row.batch.versionId,
                        );
                        if (!v) throw new Error("Template version unavailable");
                        if (
                          v.template.kind === "OFFICIAL_LETTER" ||
                          v.issueFields?.length
                        ) {
                          const copy = await api.get<Batch>(
                            "/documents/register/" + row.id,
                          );
                          const values = copy.documents[0].values;
                          setEntryFields(
                            Object.fromEntries(
                              (v.issueFields ?? []).map((f) => [
                                f.key,
                                values[f.key] ?? "",
                              ]),
                            ),
                          );
                          setRecipient(values.recipient ?? "");
                          setWording({
                            subject: values.subject,
                            body: values.body,
                          });
                          setSlot(values.signatorySlot ?? "");
                        }
                        setCategory(v.template.kind);
                        setLinkStudent(false);
                        setOriginal(row);
                        setVersion(row.batch.versionId);
                        setReason("");
                        clear();
                      })
                    }
                  >
                    Correct
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
