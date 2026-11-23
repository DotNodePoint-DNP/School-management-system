"use client";
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  assetUrl,
  displayName,
  applicationStatuses,
  inquiryStatuses,
  pageSections,
  formatDate,
} from "../services/content";
import { adminWrite, loadRows, str, tabs, type Tab, type CmsRow } from "./cms";
import ContentEditor from "./ContentEditor";
import AlbumPhotos from "./AlbumPhotos";
import "./workspace.css";

function InboxDetail({
  row,
  applications,
  onSave,
}: {
  row: CmsRow;
  applications: boolean;
  onSave: (body: Record<string, string>) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const note = applications ? "notes" : "adminNotes";
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await onSave({
        status: String(form.get("status")),
        [note]: String(form.get(note)),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="cms-panel">
      <h2>{str(row, "fullName")}</h2>
      <dl>
        {[
          ["Email", "email"],
          ["Phone", "phone"],
          ["Subject", "subject"],
          ["Student", "studentName"],
          ["Grade of interest", "targetGrade"],
          ["Message", "message"],
          ["Cover letter", "coverLetter"],
        ]
          .filter(([, key]) => !!row[key])
          .map(([label, key]) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd>{str(row, key)}</dd>
            </div>
          ))}
      </dl>
      {assetUrl(str(row, "resumeUrl")) && (
        <a
          target="_blank"
          rel="noreferrer"
          href={assetUrl(str(row, "resumeUrl"))}
        >
          Open résumé
        </a>
      )}
      <fieldset disabled={busy} className="cms-form-grid">
        <label>
          Status
          <select name="status" defaultValue={str(row, "status")}>
            {(applications ? applicationStatuses : inquiryStatuses).map((s) => (
              <option value={s} key={s}>
                {displayName(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="cms-wide">
          Internal notes
          <textarea
            defaultValue={str(row, note)}
            name={note}
            maxLength={10000}
            rows={3}
          />
        </label>
        <button className="cms-primary">Save status and notes</button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
function ManagementView({ tab }: { tab: Tab }) {
  const cache = useQueryClient(),
    list = useQuery({
      queryKey: ["website-cms", tab],
      queryFn: () => loadRows(tab),
    });
  const applications = tab === "job-applications",
    inbox = applications || tab === "contact-submissions";
  const careers = useQuery({
    queryKey: ["website-cms", "careers"],
    queryFn: () => loadRows("careers"),
    enabled: applications,
  });
  const [section, setSection] = useState("home"),
    [status, setStatus] = useState(""),
    [kind, setKind] = useState(""),
    [page, setPage] = useState(1);
  const [editor, setEditor] = useState<CmsRow | "new" | null>(null),
    [opened, setOpened] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const rows = (list.data ?? []).filter(
    (r) =>
      (tab !== "entries" || r.section === section) &&
      (!status || r.status === status) &&
      (!kind || r.type === kind),
  );
  const pages = Math.max(1, Math.ceil(rows.length / 12)),
    current = Math.min(page, pages),
    path = "/" + tab;
  const detail = rows.find((r) => r.id === opened);
  function reset() {
    setOpened("");
    setEditor(null);
    setPage(1);
    setError("");
    setMessage("");
  }
  async function changed(text: string) {
    await cache.invalidateQueries({ queryKey: ["website-cms", tab] });
    setMessage(text);
    setError("");
  }
  async function action(work: () => Promise<unknown>, text: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
      await changed(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }
  const titleFor = (id: string) =>
    str(
      careers.data?.find((c) => c.id === id),
      "title",
    ) || id;
  return (
    <div>
      <div className="cms-toolbar">
        <h2>{tabs[tab]}</h2>
        {!inbox && (
          <button
            className="cms-primary"
            onClick={() => {
              setOpened("");
              setEditor("new");
              setMessage("");
            }}
          >
            Create{" "}
            {
              {
                entries: "section",
                notices: "notice",
                events: "event",
                gallery: "album",
                careers: "vacancy",
              }[tab]
            }
          </button>
        )}
      </div>
      {tab === "entries" && (
        <div className="cms-tabs" aria-label="Page sections">
          {pageSections.map((v) => (
            <button
              key={v}
              aria-pressed={v === section}
              onClick={() => {
                reset();
                setSection(v);
              }}
            >
              {v}
            </button>
          ))}
        </div>
      )}
      {inbox && (
        <div className="cms-filters">
          <label>
            Status
            <select
              value={status}
              onChange={(e) => {
                reset();
                setStatus(e.target.value);
              }}
            >
              <option value="">All statuses</option>
              {(applications ? applicationStatuses : inquiryStatuses).map(
                (v) => (
                  <option key={v} value={v}>
                    {displayName(v)}
                  </option>
                ),
              )}
            </select>
          </label>
          {!applications && (
            <label>
              Inquiry type
              <select
                value={kind}
                onChange={(e) => {
                  reset();
                  setKind(e.target.value);
                }}
              >
                <option value="">All inquiries</option>
                {["general", "admission", "feedback", "complaint"].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      {editor && !inbox && (
        <ContentEditor
          key={editor === "new" ? "new" : editor.id}
          resource={tab}
          section={section}
          row={editor === "new" ? undefined : editor}
          onCancel={() => setEditor(null)}
          onSave={async (body) => {
            const updated =
              editor === "new"
                ? await adminWrite.post<CmsRow>(path, body)
                : await adminWrite.patch<CmsRow>(path + "/" + editor.id, body);
            if (tab === "entries") setSection(String(body.section));
            setEditor(null);
            setOpened(tab === "gallery" ? updated.id : "");
            await changed("Saved successfully.");
          }}
        />
      )}
      {tab === "gallery" && opened && (
        <AlbumPhotos albumId={opened} key={opened} />
      )}
      {inbox && detail && (
        <InboxDetail
          key={detail.id}
          row={detail}
          applications={applications}
          onSave={async (body) => {
            await adminWrite.patch(path + "/" + detail.id + "/status", body);
            setOpened("");
            await changed("Inbox updated.");
          }}
        />
      )}
      {list.isPending ? (
        <p>Loading {tabs[tab].toLowerCase()}…</p>
      ) : list.error ? (
        <p role="alert">
          {list.error.message}{" "}
          <button onClick={() => list.refetch()}>Retry</button>
        </p>
      ) : !rows.length ? (
        <p className="cms-empty">No matching records.</p>
      ) : (
        <ul className="cms-list">
          {rows.slice((current - 1) * 12, current * 12).map((row) => (
            <li key={row.id}>
              <div className="cms-record">
                <strong>{str(row, inbox ? "fullName" : "title")}</strong>
                <div className="cms-badges">
                  <small>
                    {inbox
                      ? displayName(str(row, "status"))
                      : row.published
                        ? "Published"
                        : "Draft"}
                  </small>
                  {["category", "type"].map((k) =>
                    row[k] ? <small key={k}>{str(row, k)}</small> : null,
                  )}
                  {row.isPinned === true && <small>Pinned</small>}
                </div>
                {tab === "events" && (
                  <p>
                    {formatDate(str(row, "startsAt"), true)}
                    {row.endsAt
                      ? " – " + formatDate(str(row, "endsAt"), true)
                      : ""}{" "}
                    · {str(row, "venue") || "Venue pending"}
                  </p>
                )}
                {inbox && (
                  <p>
                    {applications
                      ? titleFor(str(row, "postingId"))
                      : str(row, "subject") ||
                        str(row, "message").slice(0, 90)}{" "}
                    · {formatDate(str(row, "createdAt"))}
                  </p>
                )}
                {assetUrl(str(row, "attachmentUrl")) && (
                  <a
                    href={assetUrl(str(row, "attachmentUrl"))}
                    target="_blank"
                    rel="noreferrer"
                  >
                    PDF attachment
                  </a>
                )}
              </div>
              <fieldset disabled={busy} className="cms-actions">
                {inbox ? (
                  <button
                    onClick={() => setOpened(opened === row.id ? "" : row.id)}
                  >
                    {opened === row.id ? "Close" : "Review"}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setOpened("");
                        setEditor(row);
                        setMessage("");
                      }}
                    >
                      Edit
                    </button>
                    {tab === "gallery" && (
                      <button
                        onClick={() => {
                          setEditor(null);
                          setOpened(opened === row.id ? "" : row.id);
                        }}
                      >
                        Photos
                      </button>
                    )}
                    {tab === "notices" && (
                      <button
                        onClick={() =>
                          action(
                            () =>
                              adminWrite.patch(path + "/" + row.id, {
                                isPinned: !row.isPinned,
                              }),
                            "Pin updated.",
                          )
                        }
                      >
                        {row.isPinned ? "Unpin" : "Pin"}
                      </button>
                    )}
                    <button
                      onClick={() =>
                        action(
                          () =>
                            adminWrite.patch(path + "/" + row.id + "/publish", {
                              published: !row.published,
                            }),
                          "Publication updated.",
                        )
                      }
                    >
                      {row.published ? "Unpublish" : "Publish"}
                    </button>
                    <button
                      onClick={() => {
                        if (
                          confirm(
                            "Delete “" +
                              str(row, "title") +
                              "”?" +
                              (tab === "gallery"
                                ? " This also deletes its photos."
                                : tab === "careers"
                                  ? " This also deletes its applications."
                                  : ""),
                          )
                        )
                          void action(async () => {
                            await adminWrite.delete(path + "/" + row.id);
                            if (opened === row.id) setOpened("");
                            if (editor !== "new" && editor?.id === row.id)
                              setEditor(null);
                          }, "Record deleted.");
                      }}
                    >
                      Delete
                    </button>
                  </>
                )}
              </fieldset>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <div className="cms-actions">
          <button disabled={current === 1} onClick={() => setPage(current - 1)}>
            Previous
          </button>
          Page {current} of {pages}
          <button
            disabled={current === pages}
            onClick={() => setPage(current + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
export default function WebsiteWorkspace() {
  const [tab, setTab] = useState<Tab>("entries");
  return (
    <main className="website-cms">
      <nav aria-label="Website management" className="cms-tabs">
        {(Object.keys(tabs) as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} aria-pressed={t === tab}>
            {tabs[t]}
          </button>
        ))}
      </nav>
      <ManagementView key={tab} tab={tab} />
    </main>
  );
}
