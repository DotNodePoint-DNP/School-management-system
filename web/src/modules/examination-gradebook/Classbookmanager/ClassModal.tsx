"use client";

import { useState, type FormEvent } from "react";
import type { ClassItem } from "./types";
import { btnGhost, btnPrimary, inputCls } from "./utils";
import { Field, Modal } from "./Modals";

interface ClassModalProps {
  initial: ClassItem | null;
  takenNames: string[];
  onSave: (name: string) => void;
  onClose: () => void;
}

export function ClassModal({ initial, takenNames, onSave, onClose }: ClassModalProps) {
  const [name, setName] = useState<string>(initial?.name ?? "");
  const [error, setError] = useState<string>("");

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = name.trim();
    if (!value) return setError("Enter a class name.");
    if (takenNames.includes(value.toLowerCase()))
      return setError("A class with this name already exists.");
    onSave(value);
  }

  return (
    <Modal
      title={initial ? "Edit class" : "Create class"}
      description={initial ? "Rename this class." : "Add a new class, then add books to it."}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-5">
        <Field label="Class name" required error={error}>
          <input
            autoFocus
            className={inputCls}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
            placeholder="Class 11"
          />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={btnGhost}>
            Cancel
          </button>
          <button type="submit" className={btnPrimary}>
            {initial ? "Save changes" : "Create class"}
          </button>
        </div>
      </form>
    </Modal>
  );
}