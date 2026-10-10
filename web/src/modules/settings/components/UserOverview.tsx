"use client";

import CreateUserModal from "@/components/modals/CreateUserModal";
import React, { useState } from "react";
import { toast } from "sonner";
// import CreateUserModal from "./CreateUserModal";

// --- TYPES & MOCK DATA ---
export interface UserItem {
  id: string;
  name: string;
  email: string;
  role: "Teacher" | "Parent" | "Accountant" | "Librarian" | "Admin";
  status: "ACTIVE" | "INVITED" | "SUSPENDED";
  createdAt: string;
  departmentOrInfo?: string;
}

const INITIAL_USERS: UserItem[] = [
  {
    id: "usr_1",
    name: "Arun Sharma",
    email: "arun.sharma@school.edu.np",
    role: "Teacher",
    status: "ACTIVE",
    createdAt: "2026-09-10",
    departmentOrInfo: "Science",
  },
  {
    id: "usr_2",
    name: "Ramesh Adhikari",
    email: "ramesh.a@gmail.com",
    role: "Parent",
    status: "ACTIVE",
    createdAt: "2026-09-15",
    departmentOrInfo: "2 Students Linked",
  },
  {
    id: "usr_3",
    name: "Sita Rai",
    email: "sita.rai@school.edu.np",
    role: "Accountant",
    status: "INVITED",
    createdAt: "2026-09-28",
    departmentOrInfo: "Accounts",
  },
  {
    id: "usr_4",
    name: "Gopal Shrestha",
    email: "gopal.s@school.edu.np",
    role: "Librarian",
    status: "SUSPENDED",
    createdAt: "2026-08-01",
    departmentOrInfo: "Main Library",
  },
];

export default function UserOverview() {
  const [users, setUsers] = useState<UserItem[]>(INITIAL_USERS);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("All");

  // --- CRUD HANDLERS WITH SONNER TOASTS ---
  const handleUserCreated = () => {
    toast.success("User successfully provisioned!", {
      description: "An invitation or account setup email has been dispatched.",
    });
  };

  const handleToggleStatus = (id: string, currentStatus: string) => {
    const nextStatus =
      currentStatus === "ACTIVE"
        ? "SUSPENDED"
        : currentStatus === "SUSPENDED"
        ? "ACTIVE"
        : "ACTIVE";

    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, status: nextStatus as UserItem["status"] } : u))
    );

    toast.info(`User status updated`, {
      description: `Account has been updated to ${nextStatus}.`,
    });
  };

  const handleDeleteUser = (id: string, name: string) => {
    toast.promise(
      new Promise((resolve) => setTimeout(resolve, 500)),
      {
        loading: "Removing user profile...",
        success: () => {
          setUsers((prev) => prev.filter((u) => u.id !== id));
          return `User ${name} removed permanently.`;
        },
        error: "Failed to remove user.",
      }
    );
  };

  const handleResendInvite = (email: string) => {
    toast.success(`Invitation resent`, {
      description: `Sent new token to ${email}`,
    });
  };

  // --- FILTERING ---
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === "All" || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      {/* Top Banner & Actions */}
      <div className="flex flex-col gap-4 border-b border-line pb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-ink">Admin Control Hub</h1>
          <p className="mt-1 text-xs font-medium text-muted">
            Manage global accounts, system settings, academic structures, and core ERP operations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <CreateUserModal/>
        </div>
      </div>

      {/* KPI Overview Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-line bg-panel p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">Total Accounts</span>
            <span className="rounded bg-teal/10 px-2 py-0.5 text-[10px] font-bold text-teal">+12% this mo</span>
          </div>
          <p className="mt-2 text-3xl font-black text-navy">{users.length}</p>
          <p className="mt-1 text-[11px] font-medium text-muted">Active Users across all roles</p>
        </div>

        <div className="rounded-xl border border-line bg-panel p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">Pending Invites</span>
            <span className="rounded bg-coral/10 px-2 py-0.5 text-[10px] font-bold text-coral">Action Required</span>
          </div>
          <p className="mt-2 text-3xl font-black text-coral">
            {users.filter((u) => u.status === "INVITED").length}
          </p>
          <p className="mt-1 text-[11px] font-medium text-muted">Awaiting email confirmation</p>
        </div>

        <div className="rounded-xl border border-line bg-panel p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">Active Teachers</span>
            <span className="text-xs">📚</span>
          </div>
          <p className="mt-2 text-3xl font-black text-navy">
            {users.filter((u) => u.role === "Teacher").length}
          </p>
          <p className="mt-1 text-[11px] font-medium text-muted">Assigned to academic classes</p>
        </div>

        <div className="rounded-xl border border-line bg-panel p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">System Health</span>
            <span className="inline-flex h-2 w-2 rounded-full bg-teal animate-ping" />
          </div>
          <p className="mt-2 text-3xl font-black text-teal">99.9%</p>
          <p className="mt-1 text-[11px] font-medium text-muted">All ERP services operational</p>
        </div>
      </div>

      {/* Suggested ERP Admin Quick Action Modules */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted mb-3">Recommended ERP Modules</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <button
            onClick={() => toast.info("Opening Class & Section Configurator")}
            className="flex flex-col items-start rounded-lg border border-line bg-panel p-4 text-left transition-all hover:border-teal hover:shadow-2xs"
          >
            <span className="text-lg">🏫</span>
            <span className="mt-2 text-xs font-bold text-ink">Academic Setup</span>
            <span className="text-[10px] text-muted">Grades, Sections & Seats</span>
          </button>

          <button
            onClick={() => toast.info("Opening Fee Category Matrix")}
            className="flex flex-col items-start rounded-lg border border-line bg-panel p-4 text-left transition-all hover:border-teal hover:shadow-2xs"
          >
            <span className="text-lg">💳</span>
            <span className="mt-2 text-xs font-bold text-ink">Fee Structure</span>
            <span className="text-[10px] text-muted">Tuition, Bus & Fine Rules</span>
          </button>

          <button
            onClick={() => toast.info("Opening Timetable Generator")}
            className="flex flex-col items-start rounded-lg border border-line bg-panel p-4 text-left transition-all hover:border-teal hover:shadow-2xs"
          >
            <span className="text-lg">📅</span>
            <span className="mt-2 text-xs font-bold text-ink">Routine Engine</span>
            <span className="text-[10px] text-muted">Periods & Teacher Shifts</span>
          </button>

          <button
            onClick={() => toast.info("Opening Audit Logs")}
            className="flex flex-col items-start rounded-lg border border-line bg-panel p-4 text-left transition-all hover:border-teal hover:shadow-2xs"
          >
            <span className="text-lg">🛡️</span>
            <span className="mt-2 text-xs font-bold text-ink">Security Logs</span>
            <span className="text-[10px] text-muted">Track Staff Actions</span>
          </button>
        </div>
      </div>

      {/* User Management CRUD Section */}
      <div className="rounded-xl border border-line bg-panel shadow-2xs">
        {/* Table Filter & Search Controls */}
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-ink">System Users</h2>
            <span className="rounded-full bg-background px-2.5 py-0.5 text-[10px] font-bold text-muted border border-line">
              {filteredUsers.length} Users
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="rounded-md border border-line bg-background px-3 py-1.5 text-xs font-medium text-ink placeholder:text-muted focus:border-teal focus:outline-none"
            />

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="rounded-md border border-line bg-background px-2.5 py-1.5 text-xs font-bold text-ink focus:border-teal focus:outline-none"
            >
              <option value="All">All Roles</option>
              <option value="Teacher">Teachers</option>
              <option value="Parent">Parents</option>
              <option value="Accountant">Accountants</option>
              <option value="Librarian">Librarians</option>
              <option value="Admin">Admins</option>
            </select>
          </div>
        </div>

        {/* Users Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-background border-b border-line text-[10px] uppercase tracking-wider font-bold text-muted">
              <tr>
                <th className="px-4 py-3">User Profile</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created Date</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60 font-medium text-ink">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs text-muted">
                    No users matching your search filters.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-background/50 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-bold text-ink">{user.name || "Pending User"}</p>
                        <p className="text-[11px] text-muted">{user.email}</p>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <span className="rounded bg-navy/10 px-2 py-0.5 text-[10px] font-bold text-navy">
                        {user.role}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      {user.status === "ACTIVE" && (
                        <span className="inline-flex items-center gap-1 text-teal text-[11px] font-bold">
                          ● Active
                        </span>
                      )}
                      {user.status === "INVITED" && (
                        <span className="inline-flex items-center gap-1 text-amber-600 text-[11px] font-bold">
                          ⏳ Invited
                        </span>
                      )}
                      {user.status === "SUSPENDED" && (
                        <span className="inline-flex items-center gap-1 text-coral text-[11px] font-bold">
                          ✕ Suspended
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-muted">{user.createdAt}</td>

                    <td className="px-4 py-3 text-right space-x-2">
                      {user.status === "INVITED" && (
                        <button
                          onClick={() => handleResendInvite(user.email)}
                          className="text-[11px] font-bold text-teal hover:underline"
                        >
                          Resend Link
                        </button>
                      )}

                      <button
                        onClick={() => handleToggleStatus(user.id, user.status)}
                        className="text-[11px] font-bold text-navy hover:underline"
                      >
                        {user.status === "SUSPENDED" ? "Reactivate" : "Suspend"}
                      </button>

                      <button
                        onClick={() => handleDeleteUser(user.id, user.name || user.email)}
                        className="text-[11px] font-bold text-coral hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}