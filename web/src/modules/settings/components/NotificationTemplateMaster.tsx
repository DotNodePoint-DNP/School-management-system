"use client";

import React, { useState } from "react";
import { toast } from "sonner";

// --- TYPES ---
export type TemplateChannel = "SMS" | "EMAIL";
export type TemplateCategory =
  | "FEE_REMINDER"
  | "ABSENCE_ALERT"
  | "EXAM_RESULTS"
  | "ANNOUNCEMENT";

export interface NotificationTemplate {
  id: string;
  code: string;
  title: string;
  category: TemplateCategory;
  channel: TemplateChannel;
  subject?: string; // Used for Email
  body: string;
  isSystemDefault: boolean;
}

// --- SAMPLE MOCK DATA FOR PLACEHOLDER RENDERING ---
const MOCK_PREVIEW_DATA: Record<string, string> = {
  "{studentName}": "Aarav Sharma",
  "{parentName}": "Ram Sharma",
  "{gradeName}": "Grade 10 - A",
  "{amountDue}": "Rs. 12,500",
  "{dueDate}": "2026-10-15",
  "{examName}": "Second Terminal Examination",
  "{gpa}": "3.85",
  "{absentDate}": "September 29, 2026",
  "{schoolName}": "Mayura International School",
};

// --- AVAILABLE PLACEHOLDERS ---
const PLACEHOLDERS = [
  { tag: "{studentName}", label: "Student Name" },
  { tag: "{parentName}", label: "Parent Name" },
  { tag: "{gradeName}", label: "Grade / Section" },
  { tag: "{amountDue}", label: "Fee Amount Due" },
  { tag: "{dueDate}", label: "Fee Due Date" },
  { tag: "{examName}", label: "Exam Title" },
  { tag: "{gpa}", label: "GPA / Percentage" },
  { tag: "{absentDate}", label: "Absent Date" },
  { tag: "{schoolName}", label: "School Name" },
];

// --- INITIAL DEFAULT TEMPLATES ---
const INITIAL_TEMPLATES: NotificationTemplate[] = [
  {
    id: "tpl-1",
    code: "SMS_FEE_DUE",
    title: "Monthly Fee Due Reminder",
    category: "FEE_REMINDER",
    channel: "SMS",
    body: "Dear {parentName}, fee payment of {amountDue} for {studentName} ({gradeName}) is due by {dueDate}. Please clear dues to avoid late fees. - {schoolName}",
    isSystemDefault: true,
  },
  {
    id: "tpl-2",
    code: "EMAIL_FEE_OVERDUE",
    title: "Overdue Fee Payment Notice",
    category: "FEE_REMINDER",
    channel: "EMAIL",
    subject: "Urgent: Pending Fee Dues for {studentName}",
    body: "Dear {parentName},\n\nThis is an official reminder that the monthly fee balance of {amountDue} for {studentName} ({gradeName}) was due on {dueDate}.\n\nKindly complete the transaction at your earliest convenience via eSewa, Khalti, or bank transfer.\n\nWarm regards,\nAccounts Office\n{schoolName}",
    isSystemDefault: false,
  },
  {
    id: "tpl-3",
    code: "SMS_ABSENCE",
    title: "Unexcused Absence Alert",
    category: "ABSENCE_ALERT",
    channel: "SMS",
    body: "Alert: {studentName} was marked absent today ({absentDate}) without prior notice. Please contact administration if unexpected. - {schoolName}",
    isSystemDefault: true,
  },
  {
    id: "tpl-4",
    code: "EMAIL_EXAM_RESULT",
    title: "Terminal Exam Result Declaration",
    category: "EXAM_RESULTS",
    channel: "EMAIL",
    subject: "Exam Result Declared: {examName} - {studentName}",
    body: "Dear {parentName},\n\nThe results for {examName} have been published.\n\nStudent: {studentName} ({gradeName})\nGrade Point Average (GPA): {gpa}\n\nYou can view the detailed marksheet and subject breakdown on the Parent Portal.\n\nBest regards,\nExamination Board\n{schoolName}",
    isSystemDefault: true,
  },
];

export default function NotificationTemplateMaster() {
  const [templates, setTemplates] = useState<NotificationTemplate[]>(INITIAL_TEMPLATES);
  const [activeTab, setActiveTab] = useState<TemplateChannel>("SMS");
  const [selectedTemplate, setSelectedTemplate] = useState<NotificationTemplate>(INITIAL_TEMPLATES[0]);
  const [isCreating, setIsCreating] = useState(false);

  // Helper to replace tags with mock data for preview
  const renderLivePreview = (text: string) => {
    let result = text;
    Object.entries(MOCK_PREVIEW_DATA).forEach(([tag, val]) => {
      result = result.replaceAll(tag, val);
    });
    return result;
  };

  // Insert tag at current focus/cursor position
  const handleInsertPlaceholder = (tag: string, field: "body" | "subject" = "body") => {
    if (field === "body") {
      setSelectedTemplate((prev) => ({
        ...prev,
        body: prev.body + tag,
      }));
    } else {
      setSelectedTemplate((prev) => ({
        ...prev,
        subject: (prev.subject || "") + tag,
      }));
    }
  };

  const handleSaveTemplate = () => {
    if (!selectedTemplate.title || !selectedTemplate.body) {
      toast.error("Template Title and Body are required.");
      return;
    }

    setTemplates((prev) => {
      const exists = prev.some((t) => t.id === selectedTemplate.id);
      if (exists) {
        return prev.map((t) => (t.id === selectedTemplate.id ? selectedTemplate : t));
      }
      return [...prev, selectedTemplate];
    });

    setIsCreating(false);
    toast.success(`Template "${selectedTemplate.title}" saved successfully!`);
  };

  const handleAddNew = () => {
    const newTpl: NotificationTemplate = {
      id: `tpl-${Date.now()}`,
      code: `CUSTOM_${activeTab}_${Date.now().toString().slice(-4)}`,
      title: "New Custom Template",
      category: "ANNOUNCEMENT",
      channel: activeTab,
      subject: activeTab === "EMAIL" ? "Notice from {schoolName}" : "",
      body: "Dear {parentName}, ...",
      isSystemDefault: false,
    };
    setSelectedTemplate(newTpl);
    setIsCreating(true);
  };

  const handleDeleteTemplate = (id: string, title: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    toast.info(`Deleted template: ${title}`);
    const remaining = templates.filter((t) => t.id !== id);
    if (remaining.length > 0) {
      setSelectedTemplate(remaining[0]);
    }
  };

  const filteredTemplates = templates.filter((t) => t.channel === activeTab);

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-line pb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-ink">
            Notification Templates & Engine
          </h1>
          <p className="mt-1 text-xs font-medium text-muted">
            Configure automated SMS and Email notification triggers for fee reminders, attendance, and exam results.
          </p>
        </div>

        <button
          onClick={handleAddNew}
          className="rounded-lg bg-teal px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-panel shadow-sm transition-all hover:bg-navy focus:outline-none"
        >
          + Create Template
        </button>
      </div>

      {/* Channel Selector Tabs */}
      <div className="flex items-center gap-3 border-b border-line pb-2">
        <button
          onClick={() => {
            setActiveTab("SMS");
            const firstSms = templates.find((t) => t.channel === "SMS");
            if (firstSms) setSelectedTemplate(firstSms);
          }}
          className={`rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all ${
            activeTab === "SMS"
              ? "bg-navy text-panel shadow-2xs"
              : "bg-background text-muted hover:text-ink"
          }`}
        >
          📱 SMS Templates ({templates.filter((t) => t.channel === "SMS").length})
        </button>
        <button
          onClick={() => {
            setActiveTab("EMAIL");
            const firstEmail = templates.find((t) => t.channel === "EMAIL");
            if (firstEmail) setSelectedTemplate(firstEmail);
          }}
          className={`rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all ${
            activeTab === "EMAIL"
              ? "bg-navy text-panel shadow-2xs"
              : "bg-background text-muted hover:text-ink"
          }`}
        >
          ✉️ Email Templates ({templates.filter((t) => t.channel === "EMAIL").length})
        </button>
      </div>

      {/* Main Grid: Left List, Center Editor, Right Live Preview */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* LEFT COLUMN: TEMPLATE LIST */}
        <div className="space-y-3 lg:col-span-3">
          <div className="rounded-xl border border-line bg-panel p-3 shadow-2xs">
            <h2 className="text-xs font-black uppercase tracking-wider text-muted mb-3">
              {activeTab} Templates
            </h2>
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {filteredTemplates.map((tpl) => {
                const isSelected = selectedTemplate.id === tpl.id;
                return (
                  <div
                    key={tpl.id}
                    onClick={() => {
                      setSelectedTemplate(tpl);
                      setIsCreating(false);
                    }}
                    className={`cursor-pointer rounded-lg border p-3 transition-all ${
                      isSelected
                        ? "border-teal bg-teal/5 shadow-2xs"
                        : "border-line bg-background hover:border-muted"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="rounded bg-navy/10 px-1.5 py-0.5 text-[9px] font-black text-navy uppercase">
                        {tpl.category.replace("_", " ")}
                      </span>
                      {tpl.isSystemDefault && (
                        <span className="text-[9px] font-bold text-muted uppercase">Default</span>
                      )}
                    </div>
                    <h3 className="mt-2 text-xs font-bold text-ink">{tpl.title}</h3>
                    <p className="mt-1 line-clamp-2 text-[10px] text-muted">{tpl.body}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* CENTER COLUMN: TEMPLATE EDITOR */}
        <div className="space-y-4 lg:col-span-5">
          <div className="rounded-xl border border-line bg-panel p-5 shadow-2xs">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h2 className="text-sm font-bold text-ink">
                {isCreating ? "New Template Editor" : `Editing: ${selectedTemplate.title}`}
              </h2>
              {!selectedTemplate.isSystemDefault && (
                <button
                  onClick={() => handleDeleteTemplate(selectedTemplate.id, selectedTemplate.title)}
                  className="text-xs font-bold text-coral hover:underline"
                >
                  Delete
                </button>
              )}
            </div>

            <div className="mt-4 space-y-4 text-xs">
              {/* Category & Title */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-ink">Category</label>
                  <select
                    value={selectedTemplate.category}
                    onChange={(e) =>
                      setSelectedTemplate({
                        ...selectedTemplate,
                        category: e.target.value as TemplateCategory,
                      })
                    }
                    className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-ink font-bold focus:border-teal focus:outline-none"
                  >
                    <option value="FEE_REMINDER">Fee Reminder</option>
                    <option value="ABSENCE_ALERT">Absence Alert</option>
                    <option value="EXAM_RESULTS">Exam Results</option>
                    <option value="ANNOUNCEMENT">General Announcement</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-ink">Template Code</label>
                  <input
                    type="text"
                    value={selectedTemplate.code}
                    onChange={(e) =>
                      setSelectedTemplate({ ...selectedTemplate, code: e.target.value.toUpperCase() })
                    }
                    className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-ink uppercase font-bold focus:border-teal focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-ink">Template Title</label>
                <input
                  type="text"
                  value={selectedTemplate.title}
                  onChange={(e) =>
                    setSelectedTemplate({ ...selectedTemplate, title: e.target.value })
                  }
                  className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-ink font-bold focus:border-teal focus:outline-none"
                />
              </div>

              {/* Email Subject line (Only visible for EMAIL channel) */}
              {selectedTemplate.channel === "EMAIL" && (
                <div>
                  <div className="flex items-center justify-between">
                    <label className="block font-bold text-ink">Email Subject Line</label>
                  </div>
                  <input
                    type="text"
                    value={selectedTemplate.subject || ""}
                    onChange={(e) =>
                      setSelectedTemplate({ ...selectedTemplate, subject: e.target.value })
                    }
                    className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-ink font-bold focus:border-teal focus:outline-none"
                  />
                </div>
              )}

              {/* Dynamic Placeholders Toolbar */}
              <div>
                <label className="block font-bold text-ink mb-1.5">
                  Insert Dynamic Variable Tokens
                </label>
                <div className="flex flex-wrap gap-1.5 rounded-lg border border-line bg-background p-2">
                  {PLACEHOLDERS.map((ph) => (
                    <button
                      key={ph.tag}
                      type="button"
                      onClick={() => handleInsertPlaceholder(ph.tag)}
                      className="rounded bg-navy/10 px-2 py-1 text-[10px] font-bold text-navy hover:bg-teal hover:text-panel transition-colors"
                      title={`Insert ${ph.label}`}
                    >
                      + {ph.tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Template Body Textarea */}
              <div>
                <label className="block font-bold text-ink">Template Body</label>
                <textarea
                  rows={selectedTemplate.channel === "EMAIL" ? 8 : 4}
                  value={selectedTemplate.body}
                  onChange={(e) =>
                    setSelectedTemplate({ ...selectedTemplate, body: e.target.value })
                  }
                  className="mt-1 w-full rounded-md border border-line bg-background p-3 text-xs font-mono text-ink focus:border-teal focus:outline-none"
                />
                {selectedTemplate.channel === "SMS" && (
                  <div className="mt-1 flex justify-between text-[10px] text-muted">
                    <span>
                      Character Count: <strong>{selectedTemplate.body.length}</strong>
                    </span>
                    <span>
                      Est. Segments:{" "}
                      <strong>{Math.ceil(selectedTemplate.body.length / 160) || 1} SMS</strong>
                    </span>
                  </div>
                )}
              </div>

              {/* Save Action */}
              <button
                onClick={handleSaveTemplate}
                className="w-full rounded-lg bg-teal py-2.5 text-xs font-bold uppercase tracking-wider text-panel shadow-sm hover:bg-navy transition-all"
              >
                Save Template
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: LIVE REAL-TIME PREVIEW */}
        <div className="space-y-4 lg:col-span-4">
          <div className="rounded-xl border border-line bg-panel p-5 shadow-2xs">
            <h2 className="text-xs font-black uppercase tracking-wider text-muted mb-3">
              📱 Real-Time Live Render Preview
            </h2>

            {selectedTemplate.channel === "SMS" ? (
              /* SMS Preview Mock Frame */
              <div className="mx-auto max-w-[280px] rounded-3xl border-4 border-navy/20 bg-background p-4 shadow-md">
                <div className="mb-3 border-b border-line/60 pb-2 text-center">
                  <span className="text-[10px] font-bold text-muted">School SMS Gateway</span>
                  <p className="text-[9px] text-muted">Today at 09:30 AM</p>
                </div>
                <div className="rounded-2xl rounded-bl-none bg-teal/10 p-3 text-xs font-medium text-ink shadow-2xs border border-teal/20 leading-relaxed whitespace-pre-wrap">
                  {renderLivePreview(selectedTemplate.body)}
                </div>
              </div>
            ) : (
              /* Email Preview Mock Frame */
              <div className="rounded-lg border border-line bg-background p-4 shadow-2xs text-xs">
                <div className="border-b border-line pb-2 space-y-1 text-[11px]">
                  <div>
                    <span className="text-muted font-bold">From:</span>{" "}
                    <span className="font-medium text-ink">notifications@school.edu.np</span>
                  </div>
                  <div>
                    <span className="text-muted font-bold">To:</span>{" "}
                    <span className="font-medium text-ink">ram.sharma@gmail.com</span>
                  </div>
                  <div>
                    <span className="text-muted font-bold">Subject:</span>{" "}
                    <span className="font-bold text-navy">
                      {renderLivePreview(selectedTemplate.subject || "")}
                    </span>
                  </div>
                </div>
                <div className="mt-3 leading-relaxed text-ink whitespace-pre-wrap font-sans">
                  {renderLivePreview(selectedTemplate.body)}
                </div>
              </div>
            )}

            {/* Placeholder Legend Box */}
            <div className="mt-6 rounded-lg border border-line bg-background p-3 text-[11px]">
              <span className="font-bold text-navy block mb-1">Preview Context Data used:</span>
              <div className="grid grid-cols-2 gap-1 text-[10px] text-muted">
                {Object.entries(MOCK_PREVIEW_DATA).map(([tag, val]) => (
                  <div key={tag}>
                    <code className="text-teal font-bold">{tag}</code> = "{val}"
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}