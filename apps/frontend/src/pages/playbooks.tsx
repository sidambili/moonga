import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListPlaybooks,
  useCreatePlaybook,
  useUpdatePlaybook,
  useDeletePlaybook,
  useListSkills,
  useCreateSkill,
  useUpdateSkill,
  useDeleteSkill,
  getListPlaybooksQueryKey,
  getListSkillsQueryKey,
} from "@workspace/api-client-react";
import type { Playbook, Skill } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/format";
import { BookOpen, Zap, ChevronDown, ChevronRight, Plus, Trash2, Lock } from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function objectiveBadge(objective: string) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
      objective === "plan" ? "bg-blue-500/10 text-blue-500" : "bg-amber-500/10 text-amber-500"
    )}>
      {objective}
    </span>
  );
}

function sourceBadge(source: string) {
  return source === "system" ? (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      <Lock className="w-2.5 h-2.5" /> system
    </span>
  ) : (
    <span className="text-[11px] text-muted-foreground">user</span>
  );
}

// ── Playbook row ──────────────────────────────────────────────────────────────

function PlaybookRow({ playbook, onSaved }: { playbook: Playbook; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState(playbook.instructions);
  const [isActive, setIsActive] = useState(playbook.is_active);
  const [dirty, setDirty] = useState(false);

  const updateMutation = useUpdatePlaybook();
  const deleteMutation = useDeletePlaybook();

  function handleSave() {
    updateMutation.mutate(
      { id: playbook.id, data: { instructions, is_active: isActive } },
      {
        onSuccess: () => {
          toast({ title: "Playbook saved" });
          setDirty(false);
          onSaved();
        },
      }
    );
  }

  function handleDelete() {
    deleteMutation.mutate(
      { id: playbook.id },
      { onSuccess: () => { toast({ title: "Playbook deleted" }); onSaved(); } }
    );
  }

  return (
    <div className="border-b border-border last:border-0">
      <div
        className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
        <span className="text-sm font-medium flex-1">{playbook.name}</span>
        <div className="flex items-center gap-3">
          {objectiveBadge(playbook.objective)}
          {playbook.trigger_source && (
            <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded tabular-nums">
              {playbook.trigger_source}
            </span>
          )}
          {sourceBadge(playbook.source)}
          <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", isActive ? "bg-emerald-400" : "bg-muted-foreground/40")} />
        </div>
      </div>

      {open && (
        <div className="px-4 pb-4 space-y-3 bg-muted/20 border-t border-border">
          <div className="flex items-center justify-between pt-3">
            <Label className="text-xs font-medium text-muted-foreground">Instructions</Label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setIsActive((v) => !v); setDirty(true); }}
                className={cn(
                  "text-[11px] px-2 py-0.5 rounded border transition-colors",
                  isActive
                    ? "border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10"
                    : "border-border text-muted-foreground hover:bg-accent"
                )}
              >
                {isActive ? "Active" : "Inactive"}
              </button>
              {playbook.source === "user" && (
                <button
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                  className="text-[11px] px-2 py-0.5 rounded border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
          <textarea
            value={instructions}
            onChange={(e) => { setInstructions(e.target.value); setDirty(true); }}
            rows={18}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!dirty || updateMutation.isPending}
              className="text-xs h-7"
            >
              {updateMutation.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Skill row ─────────────────────────────────────────────────────────────────

function SkillRow({ skill, onSaved }: { skill: Skill; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState(skill.content);
  const [isActive, setIsActive] = useState(skill.is_active);
  const [dirty, setDirty] = useState(false);

  const updateMutation = useUpdateSkill();
  const deleteMutation = useDeleteSkill();

  function handleSave() {
    updateMutation.mutate(
      { id: skill.id, data: { content, is_active: isActive } },
      {
        onSuccess: () => {
          toast({ title: "Skill saved" });
          setDirty(false);
          onSaved();
        },
      }
    );
  }

  function handleDelete() {
    deleteMutation.mutate(
      { id: skill.id },
      { onSuccess: () => { toast({ title: "Skill deleted" }); onSaved(); } }
    );
  }

  return (
    <div className="border-b border-border last:border-0">
      <div
        className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
        <span className="text-sm font-medium flex-1">{skill.name}</span>
        <div className="flex items-center gap-3">
          {sourceBadge(skill.source)}
          <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", isActive ? "bg-emerald-400" : "bg-muted-foreground/40")} />
        </div>
      </div>

      {open && (
        <div className="px-4 pb-4 space-y-3 bg-muted/20 border-t border-border">
          <div className="flex items-center justify-between pt-3">
            <Label className="text-xs font-medium text-muted-foreground">Content</Label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setIsActive((v) => !v); setDirty(true); }}
                className={cn(
                  "text-[11px] px-2 py-0.5 rounded border transition-colors",
                  isActive
                    ? "border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10"
                    : "border-border text-muted-foreground hover:bg-accent"
                )}
              >
                {isActive ? "Active" : "Inactive"}
              </button>
              {skill.source === "user" && (
                <button
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                  className="text-[11px] px-2 py-0.5 rounded border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
          <textarea
            value={content}
            onChange={(e) => { setContent(e.target.value); setDirty(true); }}
            rows={8}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!dirty || updateMutation.isPending}
              className="text-xs h-7"
            >
              {updateMutation.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── New playbook form ─────────────────────────────────────────────────────────

function NewPlaybookForm({ onCreated }: { onCreated: () => void }) {
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("plan");
  const [triggerSource, setTriggerSource] = useState("");
  const [instructions, setInstructions] = useState("");
  const createMutation = useCreatePlaybook();

  function handleSubmit() {
    if (!slug || !name || !instructions) return;
    createMutation.mutate(
      { data: { slug, name, objective, trigger_source: triggerSource || null, instructions } },
      {
        onSuccess: () => {
          toast({ title: "Playbook created" });
          setSlug(""); setName(""); setInstructions(""); setTriggerSource("");
          onCreated();
        },
      }
    );
  }

  return (
    <div className="px-4 py-4 border-t border-border space-y-3 bg-muted/10">
      <p className="text-xs font-medium text-muted-foreground">New playbook</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-7 text-xs bg-muted/40" placeholder="My custom plan" />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Slug</Label>
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} className="h-7 text-xs bg-muted/40 font-mono" placeholder="my-custom-plan" />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Objective</Label>
          <Select value={objective} onValueChange={setObjective}>
            <SelectTrigger className="w-full h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="plan">plan</SelectItem>
              <SelectItem value="diagnose">diagnose</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Trigger source (optional)</Label>
          <Input value={triggerSource} onChange={(e) => setTriggerSource(e.target.value)} className="h-7 text-xs bg-muted/40" placeholder="linear / github / …" />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">Instructions</Label>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={8}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y"
          placeholder="## Objective&#10;Describe what the agent should do…"
        />
      </div>
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={!slug || !name || !instructions || createMutation.isPending}
          className="text-xs h-7"
        >
          {createMutation.isPending ? "Creating…" : "Create playbook"}
        </Button>
      </div>
    </div>
  );
}

// ── New skill form ────────────────────────────────────────────────────────────

function NewSkillForm({ onCreated }: { onCreated: () => void }) {
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const createMutation = useCreateSkill();

  function handleSubmit() {
    if (!slug || !name || !content) return;
    createMutation.mutate(
      { data: { slug, name, content } },
      {
        onSuccess: () => {
          toast({ title: "Skill created" });
          setSlug(""); setName(""); setContent("");
          onCreated();
        },
      }
    );
  }

  return (
    <div className="px-4 py-4 border-t border-border space-y-3 bg-muted/10">
      <p className="text-xs font-medium text-muted-foreground">New skill</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-7 text-xs bg-muted/40" placeholder="Incident severity rubric" />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Slug</Label>
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} className="h-7 text-xs bg-muted/40 font-mono" placeholder="incident-severity-rubric" />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">Content</Label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y"
          placeholder="## Our severity definitions&#10;P0 — full outage…"
        />
      </div>
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={!slug || !name || !content || createMutation.isPending}
          className="text-xs h-7"
        >
          {createMutation.isPending ? "Creating…" : "Create skill"}
        </Button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PlaybooksPage() {
  const queryClient = useQueryClient();
  const [showNewPlaybook, setShowNewPlaybook] = useState(false);
  const [showNewSkill, setShowNewSkill] = useState(false);

  const { data: playbooks, isLoading: playbooksLoading } = useListPlaybooks();
  const { data: skills, isLoading: skillsLoading } = useListSkills();

  function invalidatePlaybooks() {
    queryClient.invalidateQueries({ queryKey: getListPlaybooksQueryKey() });
  }
  function invalidateSkills() {
    queryClient.invalidateQueries({ queryKey: getListSkillsQueryKey() });
  }

  return (
    <div className="px-5 py-5 max-w-6xl mx-auto space-y-5">

      {/* Playbooks panel */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-sm font-medium">Playbooks</span>
            {playbooks && (
              <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded tabular-nums">
                {playbooks.length}
              </span>
            )}
          </div>
          <button
            onClick={() => setShowNewPlaybook((v) => !v)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="w-3 h-3" />
            New
          </button>
        </div>

        {playbooksLoading ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : !playbooks?.length ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">No playbooks yet.</div>
        ) : (
          playbooks.map((p) => (
            <PlaybookRow key={p.id} playbook={p} onSaved={() => { invalidatePlaybooks(); setShowNewPlaybook(false); }} />
          ))
        )}

        {showNewPlaybook && (
          <NewPlaybookForm onCreated={() => { invalidatePlaybooks(); setShowNewPlaybook(false); }} />
        )}
      </div>

      {/* Skills panel */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-sm font-medium">Skills</span>
            <span className="text-[11px] text-muted-foreground">injected into every session when active</span>
            {skills && (
              <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded tabular-nums">
                {skills.length}
              </span>
            )}
          </div>
          <button
            onClick={() => setShowNewSkill((v) => !v)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="w-3 h-3" />
            New
          </button>
        </div>

        {skillsLoading ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : !skills?.length ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            No skills yet. Add one to inject org-specific context into every session.
          </div>
        ) : (
          skills.map((s) => (
            <SkillRow key={s.id} skill={s} onSaved={() => { invalidateSkills(); setShowNewSkill(false); }} />
          ))
        )}

        {showNewSkill && (
          <NewSkillForm onCreated={() => { invalidateSkills(); setShowNewSkill(false); }} />
        )}
      </div>

    </div>
  );
}
