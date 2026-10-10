"use client";

import { btnDangerSolid, btnGhost } from "./utils";
import { Modal } from "./Modals";

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmModal({
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-sm text-muted">{message}</p>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={btnGhost}>
          Cancel
        </button>
        <button
          type="button"
          autoFocus
          onClick={onConfirm}
          className={btnDangerSolid}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
