"use client";

import UserCreationForm, { UserCreationFormData } from "@/modules/settings/components/CreateUserForm";
import React, { useState } from "react";

interface CreateUserModalProps {
  onSuccess?: () => void;
}

export default function CreateUserModal({ onSuccess }: CreateUserModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (data: UserCreationFormData) => {
    setIsLoading(true);
    try {
      // Replace with your API call: await fetch('/api/users', ...)
      console.log("Submitting User Data:", data);
      
      // Simulate network request
      await new Promise((resolve) => setTimeout(resolve, 800));
      
      setIsOpen(false);
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error("Failed to create user:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 rounded-md bg-teal px-4 py-2 text-xs font-bold uppercase tracking-wider text-panel shadow-sm transition-all hover:bg-navy focus:outline-none focus:ring-2 focus:ring-teal focus:ring-offset-2"
      >
        <span className="text-base leading-none">+</span> Add User
      </button>

      {/* Modal Overlay & Container */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-ink/50 backdrop-blur-xs transition-opacity"
            onClick={() => setIsOpen(false)}
          />

          {/* Dialog Content Panel */}
          <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-panel shadow-2xl transition-all border border-line">
            {/* Modal Close Button (Top Right) */}
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-background hover:text-ink"
              aria-label="Close modal"
            >
              ✕
            </button>

            {/* User Form inside Modal */}
            <UserCreationForm onSubmit={handleSubmit} isLoading={isLoading} />
          </div>
        </div>
      )}
    </>
  );
}