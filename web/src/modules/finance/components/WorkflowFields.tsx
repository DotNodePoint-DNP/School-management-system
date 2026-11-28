import { RecordPicker } from "./RecordFinder";
import { financeLabel } from "../services/presentation";
import { useState } from "react";
import { humanLabel, isRecord } from "@/components/RecordDetails";
import {
  Field,
  inputClass,
  buttonClass,
} from "@/components/ui/WorkspaceFields";
import { forms, type FieldSpec } from "../services/workflows";
import type { Values } from "../services/requests";

export type Options = Record<string, { id: string; name: string }[]>;
interface Props {
  field: FieldSpec;
  value: unknown;
  change: (value: unknown) => void;
  options: Options;
}
export function WorkflowField({ field: f, value, change, options }: Props) {
  const [enabled, setEnabled] = useState(Boolean(f.required));
  const label = financeLabel(f.key);
  if (f.type === "group" || f.type === "rows") {
    const rows = Array.isArray(value) ? value : [];
    const schema = forms[f.schema!];
    const modify = (row: Values, key: string, data: unknown) => ({
      ...row,
      [key]: data,
    });
    return (
      <fieldset className="col-span-full space-y-3 rounded-lg border border-line p-3">
        <legend className="px-2 font-medium">{label}</legend>
        {f.type === "group" && !f.required && (
          <label>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => {
                setEnabled(e.target.checked);
                change(e.target.checked ? {} : undefined);
              }}
            />{" "}
            Include {label.toLowerCase()}
          </label>
        )}
        {f.type === "group" && enabled && (
          <div className="grid gap-3 sm:grid-cols-2">
            {schema.map((s) => (
              <WorkflowField
                key={s.key}
                field={s}
                value={isRecord(value) ? value[s.key] : undefined}
                options={options}
                change={(v) =>
                  change(modify(isRecord(value) ? value : {}, s.key, v))
                }
              />
            ))}
          </div>
        )}
        {f.type === "rows" && (
          <>
            {rows.map((row, i) => (
              <div
                key={i}
                className="grid gap-3 rounded-lg bg-background p-3 sm:grid-cols-2"
              >
                {schema.map((s) => (
                  <WorkflowField
                    key={s.key}
                    field={s}
                    value={row[s.key]}
                    options={options}
                    change={(v) =>
                      change(
                        rows.map((r, n) =>
                          n === i ? modify(row, s.key, v) : r,
                        ),
                      )
                    }
                  />
                ))}
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => change(rows.filter((_, n) => n !== i))}
                >
                  Remove row
                </button>
              </div>
            ))}
            <button
              type="button"
              className={buttonClass}
              onClick={() => change([...rows, {}])}
            >
              Add row
            </button>
          </>
        )}
      </fieldset>
    );
  }
  const list = f.type === "list";
  if (/Ids?$/.test(f.key) || f.key === "id")
    return (
      <div>
        <RecordPicker
          fieldKey={f.key}
          value={value}
          change={change}
          required={f.required}
          multiple={list}
          options={options}
        />
        {f.hint && <p className="mt-1 text-xs text-muted">{f.hint}</p>}
      </div>
    );
  const raw = value === undefined ? "" : String(value);
  const common = { className: inputClass, required: f.required, value: raw };
  return (
    <div className="min-w-0">
      <Field label={label + (f.required ? " *" : "")}>
        {f.choices || f.type === "boolean" ? (
          <select
            {...common}
            onChange={(e) =>
              change(
                e.target.value === ""
                  ? undefined
                  : f.type === "boolean"
                    ? e.target.value === "true"
                    : f.type === "number"
                      ? Number(e.target.value)
                      : e.target.value,
              )
            }
          >
            <option value="">Select…</option>
            {(f.choices ?? ["true", "false"]).map((v) => (
              <option key={v} value={v}>
                {f.type === "boolean"
                  ? v === "true"
                    ? "Yes"
                    : "No"
                  : humanLabel(String(v))}
              </option>
            ))}
          </select>
        ) : (
          <input
            {...common}
            type={
              f.type === "number"
                ? "number"
                : f.type === "date"
                  ? "date"
                  : "text"
            }
            min={f.min}
            max={f.max}
            minLength={f.type === "text" ? f.min : undefined}
            maxLength={f.type === "text" ? f.max : undefined}
            step="any"
            onChange={(e) =>
              change(
                e.target.value === ""
                  ? undefined
                  : f.type === "number"
                    ? Number(e.target.value)
                    : e.target.value,
              )
            }
          />
        )}
      </Field>
      {(f.hint || f.type === "list" || f.type === "numbers") && (
        <p className="mt-1 text-xs text-muted">
          {f.hint}{" "}
          {(f.type === "list" || f.type === "numbers") &&
            "Separate values with commas."}
        </p>
      )}
    </div>
  );
}

export function formPayload(schema: FieldSpec[], draft: Values): Values {
  const data: Values = {};
  for (const field of schema) {
    const val = draft[field.key];
    if (val === undefined || val === "") {
      if (field.required && field.type === "rows") data[field.key] = [];
      continue;
    }
    if (field.type === "group" && isRecord(val))
      data[field.key] = formPayload(forms[field.schema!], val);
    else if (field.type === "rows" && Array.isArray(val))
      data[field.key] = val.map((row) =>
        formPayload(forms[field.schema!], row),
      );
    else if (field.type === "list" || field.type === "numbers") {
      const parts = String(val)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      data[field.key] = field.type === "numbers" ? parts.map(Number) : parts;
    } else data[field.key] = typeof val === "string" ? val.trim() : val;
  }
  return data;
}
