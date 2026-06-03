import { useState } from "react";
import { cn } from "@/lib/format";
import { ModelSection } from "@/components/settings/model-section";
import { OrganizationSection } from "@/components/settings/organization-section";

const sections = [
  { id: "model", label: "Model" },
  { id: "organization", label: "Organization" },
] as const;

type SectionId = (typeof sections)[number]["id"];

export default function Settings() {
  const [section, setSection] = useState<SectionId>("model");

  return (
    <div className="px-5 py-5 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center gap-1 border-b border-border">
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={cn(
              "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              section === s.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === "model" ? <ModelSection /> : <OrganizationSection />}
    </div>
  );
}
