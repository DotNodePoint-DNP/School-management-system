"use client";
import { useState, type FormEvent } from "react";
import { assetUrl, displayName } from "../services/content";
import {
  fields,
  fieldValue,
  editorialPayload,
  uploadFile,
  type Field,
  type CmsRow,
  type EditorialTab,
} from "./cms";
function AssetField({
  field,
  initial,
  onBusy,
}: {
  field: Field;
  initial: string;
  onBusy: (pending: boolean) => void;
}) {
  const [url, setUrl] = useState(initial),
    [error, setError] = useState("");
  return (
    <div className="cms-asset">
      <label>
        {field.label} URL
        <input
          value={url}
          name={field.key}
          placeholder="https://"
          onChange={(e) => setUrl(e.target.value)}
        />
      </label>
      <label>
        Upload {field.type === "pdf" ? "PDF" : "image"}
        <input
          type="file"
          accept={
            field.type === "pdf" ? "application/pdf" : "image/jpeg,image/png"
          }
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            onBusy(true);
            setError("");
            try {
              setUrl(
                await uploadFile(file, field.type === "pdf" ? "pdf" : "image"),
              );
            } catch (err) {
              setError(err instanceof Error ? err.message : "Upload failed.");
            } finally {
              onBusy(false);
            }
          }}
        />
      </label>
      {assetUrl(url) && (
        <a href={assetUrl(url)} target="_blank" rel="noreferrer">
          View {field.label.toLowerCase()}
        </a>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export default function ContentEditor({
  resource,
  row,
  section,
  onSave,
  onCancel,
}: {
  resource: EditorialTab;
  row?: CmsRow;
  section: string;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await onSave(editorialPayload(resource, form));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="cms-panel" onSubmit={submit}>
      <h2>
        {row ? "Edit" : "Create"}{" "}
        {
          {
            entries: "page section",
            notices: "notice",
            events: "event",
            gallery: "album",
            careers: "vacancy",
          }[resource]
        }
      </h2>
      <fieldset disabled={busy} className="cms-form-grid">
        {fields[resource].map((field) => {
          const value = fieldValue(field, row);
          if (field.type === "image" || field.type === "pdf")
            return (
              <AssetField
                key={field.key}
                field={field}
                initial={value}
                onBusy={setBusy}
              />
            );
          if (field.type === "checkbox")
            return (
              <label className="cms-choice" key={field.key}>
                <input
                  name={field.key}
                  defaultChecked={Boolean(row?.[field.key])}
                  type="checkbox"
                />
                {field.label}
              </label>
            );
          return (
            <label
              key={field.key}
              className={
                ["area", "json"].includes(field.type ?? "") ? "cms-wide" : ""
              }
            >
              {field.label}
              {field.required ? " *" : ""}
              {field.type === "select" ? (
                <select
                  name={field.key}
                  defaultValue={
                    value ||
                    (field.key === "section" ? section : field.choices?.[0])
                  }
                >
                  {field.choices?.map((v) => (
                    <option key={v} value={v}>
                      {displayName(v)}
                    </option>
                  ))}
                </select>
              ) : field.type === "area" || field.type === "json" ? (
                <textarea
                  name={field.key}
                  rows={
                    field.key === "body" || field.key === "description" ? 6 : 3
                  }
                  defaultValue={value}
                  required={field.required}
                />
              ) : (
                <input
                  name={field.key}
                  type={field.type ?? "text"}
                  defaultValue={value}
                  required={field.required || field.type === "number"}
                  min={
                    field.type === "number"
                      ? field.key === "vacancies"
                        ? 1
                        : 0
                      : undefined
                  }
                />
              )}
            </label>
          );
        })}
        <div className="cms-actions cms-wide">
          <button className="cms-primary">
            Save {row ? "changes" : "draft"}
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
