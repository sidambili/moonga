import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProjects,
  useCreateProject,
  useUpdateProject,
  useActivateProject,
  useListProjectSources,
  useCreateProjectSource,
  useUpdateProjectSource,
  useDeleteProjectSource,
  useListIntegrationRepos,
  useListIntegrationTeams,
  getListProjectsQueryKey,
  getListProjectSourcesQueryKey,
} from "@workspace/api-client-react";
import { Building2, FolderGit2, Users, Check, Trash2, Pencil, Plug, Loader2, ChevronsUpDown, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { authClient } from "@/lib/auth-client";
import { toast } from "@/hooks/use-toast";

// Shapes better-auth returns inside getFullOrganization (surfaced by
// useActiveOrganization) but doesn't export cleanly enough to import here.
type OrgMember = { id: string; userId: string; role: string; user?: { email?: string; name?: string } };
type OrgInvitation = { id: string; email: string; role?: string | null; status: string };

export function OrganizationSection() {
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const { data: activeOrg, isPending: orgPending, refetch: refetchOrg } =
    authClient.useActiveOrganization();
  // activeMember gives the current user's role directly — more reliable than
  // searching activeOrg.members, which can be empty if the join doesn't load.
  const { data: activeMember } = authClient.useActiveMember();

  if (orgPending) {
    return <div className="px-4 py-10 text-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (!activeOrg) {
    return (
      <div className="px-4 py-10 text-center text-sm text-muted-foreground">
        No active organization.
      </div>
    );
  }

  const members = (activeOrg.members ?? []) as OrgMember[];
  const invitations = ((activeOrg.invitations ?? []) as OrgInvitation[]).filter(
    (i) => i.status === "pending",
  );
  const myRole =
    (activeMember as { role?: string } | null | undefined)?.role ??
    members.find((m) => m.userId === session?.user?.id)?.role;
  const canManage = myRole === "owner" || myRole === "admin";

  return (
    <div className="space-y-5">
      <OrgRenamePanel
        orgId={activeOrg.id}
        name={activeOrg.name}
        canManage={canManage}
        onSaved={() => refetchOrg()}
      />
      <ProjectsPanel
        canManage={canManage}
        invalidate={() => {
          queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListProjectSourcesQueryKey() });
        }}
      />
      <MembersPanel
        orgId={activeOrg.id}
        members={members}
        invitations={invitations}
        currentUserId={session?.user?.id}
        canManage={canManage}
        onChanged={() => refetchOrg()}
      />
    </div>
  );
}

function Panel({
  icon: Icon,
  title,
  count,
  children,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count?: number;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-sm font-medium">{title}</span>
          {count !== undefined && (
            <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded tabular-nums">
              {count}
            </span>
          )}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function OrgRenamePanel({
  orgId,
  name,
  canManage,
  onSaved,
}: {
  orgId: string;
  name: string;
  canManage: boolean;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  useEffect(() => setValue(name), [name]);

  const save = async () => {
    if (!value.trim() || value.trim() === name) return;
    setSaving(true);
    const { error } = await authClient.organization.update({
      data: { name: value.trim() },
      organizationId: orgId,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Failed to rename organization", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Organization renamed" });
    onSaved();
  };

  return (
    <Panel icon={Building2} title="Organization">
      <div className="px-4 py-4 space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">Name</Label>
        <div className="flex items-center gap-2">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={!canManage}
            className="bg-muted/40 border-border text-sm"
          />
          <Button onClick={save} disabled={!canManage || saving || !value.trim() || value.trim() === name}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
        {!canManage && (
          <p className="text-[11px] text-muted-foreground">Only owners and admins can rename the organization.</p>
        )}
      </div>
    </Panel>
  );
}

function ProjectsPanel({ canManage, invalidate }: { canManage: boolean; invalidate: () => void }) {
  const { data, isLoading } = useListProjects();
  const { data: allSourcesData } = useListProjectSources();
  const createMutation = useCreateProject();
  const updateMutation = useUpdateProject();
  const activateMutation = useActivateProject();

  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  const projects = data?.items ?? [];
  const activeProjectId = data?.activeProjectId ?? null;
  const allSources = allSourcesData ?? [];

  const toggleSources = (id: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const create = () => {
    if (!newName.trim()) return;
    createMutation.mutate(
      { data: { name: newName.trim() } },
      {
        onSuccess: () => {
          setNewName("");
          invalidate();
          toast({ title: "Project created" });
        },
        onError: () => toast({ title: "Failed to create project", variant: "destructive" }),
      },
    );
  };

  const saveRename = () => {
    if (!editing || !editing.name.trim()) return;
    updateMutation.mutate(
      { id: editing.id, data: { name: editing.name.trim() } },
      {
        onSuccess: () => {
          setEditing(null);
          invalidate();
          toast({ title: "Project renamed" });
        },
        onError: () => toast({ title: "Failed to rename project", variant: "destructive" }),
      },
    );
  };

  const activate = (id: string) => {
    activateMutation.mutate(
      { id },
      {
        onSuccess: () => {
          invalidate();
          toast({ title: "Active project switched" });
        },
        onError: () => toast({ title: "Failed to switch project", variant: "destructive" }),
      },
    );
  };

  return (
    <Panel icon={FolderGit2} title="Projects" count={projects.length}>
      {isLoading ? (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (
        <table className="w-full">
          <tbody className="divide-y divide-border">
            {projects.map((p) => {
              const isActive = p.id === activeProjectId;
              const isEditing = editing?.id === p.id;
              const isExpanded = expandedProjects.has(p.id);
              const projectSources = allSources.filter((s) => s.project_id === p.id);

              return (
                <>
                  <tr key={p.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-2.5 max-w-0">
                      {isEditing ? (
                        <Input
                          autoFocus
                          value={editing!.name}
                          onChange={(e) => setEditing({ id: p.id, name: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveRename();
                            if (e.key === "Escape") setEditing(null);
                          }}
                          className="h-7 text-sm bg-muted/40 border-border"
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-sm truncate">{p.name}</span>
                          {isActive && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                              <Check className="w-3 h-3" /> Active
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 hidden sm:table-cell">
                      <span className="text-xs text-muted-foreground">{p.slug}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" className="h-7 text-xs" onClick={saveRename} disabled={updateMutation.isPending}>
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(null)}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          {!isActive && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => activate(p.id)}
                              disabled={activateMutation.isPending}
                            >
                              Switch
                            </Button>
                          )}
                          {canManage && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              title="Rename"
                              onClick={() => setEditing({ id: p.id, name: p.name })}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 gap-1 text-xs text-muted-foreground"
                            title={isExpanded ? "Hide sources" : "Show sources"}
                            onClick={() => toggleSources(p.id)}
                          >
                            <Plug className="w-3 h-3" />
                            {projectSources.length > 0 && (
                              <span className="tabular-nums">{projectSources.length}</span>
                            )}
                            <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${p.id}-sources`}>
                      <td colSpan={3} className="p-0">
                        <ProjectSourcesCollapsible
                          projectId={p.id}
                          sources={projectSources}
                          canManage={canManage}
                          invalidate={invalidate}
                        />
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
            {projects.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No projects yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {canManage && (
        <div className="flex items-center gap-2 px-4 py-3 border-t border-border">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="New project name…"
            className="h-8 text-sm bg-muted/40 border-border"
          />
          <Button className="h-8" onClick={create} disabled={createMutation.isPending || !newName.trim()}>
            Create
          </Button>
        </div>
      )}
    </Panel>
  );
}

type ProjectSource = {
  id: string;
  project_id: string;
  provider: string;
  external_id: string;
  label?: string | null;
  notes?: string | null;
  project_name?: string | null;
};

function ProjectSourcesCollapsible({
  projectId,
  sources,
  canManage,
  invalidate,
}: {
  projectId: string;
  sources: ProjectSource[];
  canManage: boolean;
  invalidate: () => void;
}) {
  const createMutation = useCreateProjectSource();
  const updateMutation = useUpdateProjectSource();
  const deleteMutation = useDeleteProjectSource();

  const [provider, setProvider] = useState<string>("linear");
  const [externalId, setExternalId] = useState("");
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [pendingSourceId, setPendingSourceId] = useState<string | null>(null);
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [editingNotesValue, setEditingNotesValue] = useState("");

  const add = () => {
    if (!externalId.trim()) return;
    createMutation.mutate(
      { data: { project_id: projectId, provider, external_id: externalId.trim(), label: label.trim() || undefined, notes: notes.trim() || undefined } },
      {
        onSuccess: () => {
          setExternalId(""); setLabel(""); setNotes("");
          invalidate();
          toast({ title: "Source mapped" });
        },
        onError: () => toast({ title: "Failed to map source", description: "That resource may already be mapped.", variant: "destructive" }),
      },
    );
  };

  const startEditNotes = (id: string, current: string | null) => {
    setEditingNotesId(id);
    setEditingNotesValue(current ?? "");
  };

  const saveNotes = (id: string) => {
    updateMutation.mutate(
      { id, data: { notes: editingNotesValue.trim() || null } },
      {
        onSuccess: () => {
          setEditingNotesId(null);
          invalidate();
          toast({ title: "Notes saved" });
        },
        onError: () => toast({ title: "Failed to save notes", variant: "destructive" }),
      },
    );
  };

  const remove = (id: string) => {
    if (pendingSourceId === id) return;
    setPendingSourceId(id);
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          invalidate();
          toast({ title: "Source removed" });
        },
        onError: () => toast({ title: "Failed to remove source", variant: "destructive" }),
        onSettled: () => setPendingSourceId(null),
      },
    );
  };

  return (
    <div className="bg-muted/10 border-t border-border">
      <div className="flex items-center gap-2 px-5 py-2 border-b border-border/60">
        <Plug className="w-3 h-3 text-muted-foreground" />
        <span className="text-[11px] font-medium text-muted-foreground">Sources</span>
        {sources.length > 0 && (
          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded tabular-nums">{sources.length}</span>
        )}
      </div>

      {sources.length === 0 ? (
        <div className="px-5 py-3 text-[11px] text-muted-foreground">No sources mapped to this project.</div>
      ) : (
        <div className="divide-y divide-border/60">
          {sources.map((s) => {
            const isRemoving = pendingSourceId === s.id;
            const isEditingNotes = editingNotesId === s.id;
            return (
              <div key={s.id}>
                <div className="flex items-center gap-3 px-5 py-2">
                  <span className="text-[10px] font-medium text-muted-foreground capitalize w-10 shrink-0">{s.provider}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs truncate">{s.label || s.external_id}</p>
                    {s.label && <p className="text-[10px] text-muted-foreground font-mono truncate">{s.external_id}</p>}
                    {!isEditingNotes && s.notes && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 whitespace-pre-wrap leading-relaxed">{s.notes}</p>
                    )}
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                        title={isEditingNotes ? "Cancel" : "Edit notes"}
                        onClick={() => isEditingNotes ? setEditingNotesId(null) : startEditNotes(s.id, s.notes ?? null)}
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        title="Remove source"
                        onClick={() => remove(s.id)}
                        disabled={isRemoving}
                      >
                        {isRemoving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      </Button>
                    </div>
                  )}
                </div>
                {isEditingNotes && (
                  <div className="px-5 pb-3 space-y-1.5">
                    <p className="text-[10px] text-muted-foreground">Agent instructions injected when this source triggers a session.</p>
                    <Textarea
                      value={editingNotesValue}
                      onChange={(e) => setEditingNotesValue(e.target.value)}
                      placeholder="e.g. Focus on apps/api. Escalate if error rate exceeds 1%."
                      className="text-xs min-h-[60px] bg-background"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button size="sm" className="h-6 text-xs" onClick={() => saveNotes(s.id)} disabled={updateMutation.isPending}>
                        {updateMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingNotesId(null)}>Cancel</Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {canManage && (
        <div className="px-5 py-3 border-t border-border/60 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={provider}
              onValueChange={(v) => { setProvider(v); setExternalId(""); setLabel(""); }}
            >
              <SelectTrigger className="w-[100px] h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_PROVIDERS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <SourceResourceCombobox
              provider={provider}
              value={externalId}
              onSelect={(v, l) => {
                setExternalId(v);
                if (l && (!label || label === externalId)) setLabel(l);
              }}
            />
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (optional)"
              className="h-7 text-xs bg-muted/40 border-border w-[130px]"
            />
          </div>
          <div className="flex gap-2 items-start">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Source notes (optional) — agent instructions, e.g. coding conventions, escalation rules"
              className="text-xs min-h-[48px] bg-muted/40 border-border flex-1"
            />
            <Button className="h-7 text-xs shrink-0" onClick={add} disabled={createMutation.isPending || !externalId.trim()}>
              Map
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

const SOURCE_PROVIDERS = [
  { id: "linear", label: "Linear", placeholder: "Linear team ID" },
  { id: "github", label: "GitHub", placeholder: "owner/repo" },
] as const;

// Picks the external resource from the connected integration so users select a
// repo / team by name instead of typing a raw id. Falls back to free text when
// the integration isn't connected (no api key) or the fetch fails. `onSelect`
// receives the value to store (repo full_name / team id) and a human label.
function SourceResourceCombobox({
  provider,
  value,
  onSelect,
}: {
  provider: string;
  value: string;
  onSelect: (value: string, label: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: repos, isLoading: reposLoading } = useListIntegrationRepos(provider === "github" ? "github" : "");
  const { data: teams, isLoading: teamsLoading } = useListIntegrationTeams(provider === "linear" ? "linear" : "");

  const options =
    provider === "github"
      ? (repos ?? []).map((r) => ({ value: r.full_name, label: r.full_name }))
      : provider === "linear"
      ? (teams ?? []).map((t) => ({ value: t.id, label: t.name }))
      : [];
  const isLoading = provider === "github" ? reposLoading : teamsLoading;
  const selected = options.find((o) => o.value === value);

  // Unknown provider: plain text entry.
  if (provider !== "github" && provider !== "linear") {
    return (
      <Input
        value={value}
        onChange={(e) => onSelect(e.target.value, "")}
        placeholder="External id"
        className="h-8 text-sm bg-muted/40 border-border flex-1 min-w-[140px] font-mono"
      />
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-8 justify-between bg-muted/40 border-border text-sm flex-1 min-w-[160px] font-normal"
        >
          <span className="truncate">
            {selected?.label || value || (isLoading ? "Loading…" : provider === "github" ? "Select a repository…" : "Select a team…")}
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder={provider === "github" ? "Search repositories…" : "Search teams…"} className="h-9" />
          <CommandList>
            <CommandEmpty>
              {isLoading ? "Loading…" : provider === "github" ? "No repository found." : "No team found. Connect the integration first."}
            </CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.value}`}
                  onSelect={() => {
                    onSelect(o.value, o.label);
                    setOpen(false);
                  }}
                  className="text-sm"
                >
                  <Check className={`mr-2 h-4 w-4 ${value === o.value ? "opacity-100" : "opacity-0"}`} />
                  <span className="truncate">{o.label}</span>
                  {provider === "linear" && (
                    <span className="ml-auto pl-2 text-[10px] text-muted-foreground font-mono shrink-0">{o.value.slice(0, 8)}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}


function MembersPanel({
  orgId,
  members,
  invitations,
  currentUserId,
  canManage,
  onChanged,
}: {
  orgId: string;
  members: OrgMember[];
  invitations: OrgInvitation[];
  currentUserId?: string;
  canManage: boolean;
  onChanged: () => void;
}) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [busy, setBusy] = useState(false);
  const [removeMemberPendingId, setRemoveMemberPendingId] = useState<string | null>(null);
  const [cancelInvitePendingId, setCancelInvitePendingId] = useState<string | null>(null);

  const invite = async () => {
    if (!inviteEmail.trim()) return;
    setBusy(true);
    const { error } = await authClient.organization.inviteMember({
      email: inviteEmail.trim(),
      role: inviteRole,
      organizationId: orgId,
    });
    setBusy(false);
    if (error) {
      toast({ title: "Failed to send invite", description: error.message, variant: "destructive" });
      return;
    }
    setInviteEmail("");
    toast({ title: "Invitation sent" });
    onChanged();
  };

  const removeMember = async (memberId: string) => {
    if (removeMemberPendingId === memberId) return;
    setRemoveMemberPendingId(memberId);
    try {
      const { error } = await authClient.organization.removeMember({
        memberIdOrEmail: memberId,
        organizationId: orgId,
      });
      if (error) {
        toast({ title: "Failed to remove member", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Member removed" });
      onChanged();
    } finally {
      setRemoveMemberPendingId(null);
    }
  };

  const cancelInvite = async (invitationId: string) => {
    if (cancelInvitePendingId === invitationId) return;
    setCancelInvitePendingId(invitationId);
    try {
      const { error } = await authClient.organization.cancelInvitation({ invitationId });
      if (error) {
        toast({ title: "Failed to cancel invite", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Invitation cancelled" });
      onChanged();
    } finally {
      setCancelInvitePendingId(null);
    }
  };

  return (
    <Panel icon={Users} title="Members" count={members.length}>
      <table className="w-full">
        <tbody className="divide-y divide-border">
          {members.map((m) => (
            <tr key={m.id} className="hover:bg-muted/40 transition-colors">
              <td className="px-4 py-2.5 max-w-0">
                <p className="text-sm truncate">{m.user?.email ?? m.userId}</p>
                {m.user?.name && <p className="text-[11px] text-muted-foreground truncate">{m.user.name}</p>}
              </td>
              <td className="px-4 py-2.5 hidden sm:table-cell">
                <span className="text-xs text-muted-foreground capitalize">{m.role}</span>
              </td>
              <td className="px-4 py-2.5 text-right whitespace-nowrap">
                {canManage && m.role !== "owner" && m.userId !== currentUserId && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    title="Remove member"
                    onClick={() => removeMember(m.id)}
                    disabled={removeMemberPendingId === m.id}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {invitations.length > 0 && (
        <div className="border-t border-border">
          <div className="px-4 py-2 bg-muted/30">
            <span className="text-[11px] font-medium text-muted-foreground">Pending invitations</span>
          </div>
          <table className="w-full">
            <tbody className="divide-y divide-border">
              {invitations.map((inv) => (
                <tr key={inv.id} className="hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-2.5 max-w-0">
                    <p className="text-sm truncate">{inv.email}</p>
                  </td>
                  <td className="px-4 py-2.5 hidden sm:table-cell">
                    <span className="text-xs text-muted-foreground capitalize">{inv.role ?? "member"}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {canManage && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => cancelInvite(inv.id)}
                        disabled={cancelInvitePendingId === inv.id}
                      >
                        Cancel
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage && (
        <div className="flex items-center gap-2 px-4 py-3 border-t border-border">
          <Input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && invite()}
            placeholder="teammate@example.com"
            className="h-8 text-sm bg-muted/40 border-border"
          />
          <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as "member" | "admin")}>
            <SelectTrigger className="w-28 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
          <Button className="h-8" onClick={invite} disabled={busy || !inviteEmail.trim()}>
            Invite
          </Button>
        </div>
      )}
    </Panel>
  );
}
