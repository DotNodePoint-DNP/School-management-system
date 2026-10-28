// src/modules/dashboard/components/DashboardHeader.tsx
"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  ChevronDown,
  LogOut,
  Bug,
  Settings,
  Building2,
} from "lucide-react";
import { ThemeToggle } from "@/components/ui/Toggle";
import { useAuthStore } from "@/modules/auth/store/auth-store";
import { toast } from "sonner";

export type HeaderUser = {
  displayName: string;
  roleLabel?: string | undefined;
  email?: string | undefined;
  avatarUrl?: string | undefined;
};

export default function DashboardHeader({ user }: { user?: HeaderUser }) {
  const router = useRouter();
  const signOut = useAuthStore((state) => state.signOut);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fallback defaults if user is loading or partially provided
  const currentUser = {
    displayName: user?.displayName || "User",
    roleLabel: user?.roleLabel || "Member",
    email: user?.email || "",
    avatarUrl: user?.avatarUrl || "",
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setIsProfileOpen(false);
    try {
      await signOut();
      router.replace("/auth");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to sign out.",
      );
    }
  };

  const handleStaticReportBug = () => {
    alert("Report Bug clicked!");
  };

  return (
    <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-line bg-panel/90 px-6 backdrop-blur-md transition-colors">
      {/* App Branding Context */}
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy text-panel shadow-xs">
           <Building2 className="h-4 w-4" />
        </div>
        <div>
          <h1 className="text-sm font-bold tracking-tight text-ink">
            School Management System
          </h1>
          <p className="text-[11px] font-medium text-muted">Enterprise Console</p>
        </div>
      </div>

      {/* Control Actions & User Utilities */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleStaticReportBug}
          className="inline-flex items-center gap-1.5 rounded-md border border-line bg-background px-3 py-1.5 text-xs font-semibold text-ink shadow-2xs transition hover:border-coral/40 hover:bg-coral/10 hover:text-coral focus:outline-hidden"
        >
          <Bug className="h-3.5 w-3.5 text-coral" />
          <span className="hidden sm:inline">Report Bug</span>
        </button>

        <div className="flex items-center border-l border-line pl-3">
          <ThemeToggle />
        </div>

        {/* User Profile Dropdown */}
        <div className="relative border-l border-line pl-3" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsProfileOpen((prev) => !prev)}
            className="group flex items-center gap-2.5 rounded-lg border border-transparent p-1 transition hover:border-line hover:bg-background focus:outline-hidden"
            aria-expanded={isProfileOpen}
            aria-haspopup="true"
          >
            <div className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-line bg-mint font-bold text-navy shadow-2xs dark:bg-mint/20 dark:text-teal">
              {currentUser.avatarUrl ? (
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.displayName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-xs">
                  {currentUser.displayName.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>

            <div className="hidden text-left md:block">
              <span className="block text-xs font-bold leading-none text-ink group-hover:text-teal">
                {currentUser.displayName.slice(0, 10)}...
              </span>
              <span className="mt-1 inline-flex items-center rounded-xs bg-navy/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-navy dark:bg-mint/20 dark:text-teal">
                {currentUser.roleLabel}
              </span>
            </div>

            <ChevronDown
              className={`h-3.5 w-3.5 text-muted transition-transform duration-200 ${
                isProfileOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {isProfileOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl border border-line bg-panel p-1.5 shadow-lg ring-1 ring-ink/5 animate-in fade-in-50 zoom-in-95">
              <div className="border-b border-line px-3 py-2.5">
                <p className="text-xs font-bold text-ink">
                  {currentUser.displayName}
                </p>
                <p className="truncate text-[11px] text-muted">
                  {currentUser.email}
                </p>
                <div className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-teal">
                  <ShieldCheck className="h-3 w-3" /> Authenticated Session
                </div>
              </div>

              <div className="py-1">
                <button
                  type="button"
                  onClick={() => setIsProfileOpen(false)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-ink transition hover:bg-background"
                >
                  <Settings className="h-3.5 w-3.5 text-muted" />
                  Account Settings
                </button>
              </div>

              <div className="border-t border-line pt-1">
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-coral transition hover:bg-coral/10"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Log out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}