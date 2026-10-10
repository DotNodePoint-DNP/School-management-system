"use client";

import { useState } from "react";

import DocumentTemplateMaster from "@/modules/settings/components/DocumentTemplateMaster";
import NotificationTemplateMaster from "@/modules/settings/components/NotificationTemplateMaster";

type TemplateType = "document" | "notification";

const DocumentTemplets = () => {
  const [selectedTemplate, setSelectedTemplate] =
    useState<TemplateType>("document");

  return (
    <div className="space-y-6">
      {/* Template Selector */}
      <div className="flex gap-2 border-b">
        <button
          type="button"
          onClick={() => setSelectedTemplate("document")}
          className={`px-4 py-2 ${
            selectedTemplate === "document"
              ? "border-b-2 border-primary font-medium"
              : "text-muted-foreground"
          }`}
        >
          Document Templates
        </button>

        <button
          type="button"
          onClick={() => setSelectedTemplate("notification")}
          className={`px-4 py-2 ${
            selectedTemplate === "notification"
              ? "border-b-2 border-primary font-medium"
              : "text-muted-foreground"
          }`}
        >
          Notification Templates
        </button>
      </div>

      {/* Selected Component */}
      <div>
        {selectedTemplate === "document" && <DocumentTemplateMaster />}

        {selectedTemplate === "notification" && (
          <NotificationTemplateMaster />
        )}
      </div>
    </div>
  );
};

export default DocumentTemplets;