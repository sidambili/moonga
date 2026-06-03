import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProjects,
  useCreateProject,
  useUpdateProject,
  useActivateProject,
  getListProjectsQueryKey,
} from "@workspace/api-client-react";
import { Building2, FolderGit2, Users, Check, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const myRole = members.find((m) => m.userId === session?.user?.id)?.role;
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
        invalidate={() =>
          queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() })
        }
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
  const createMutation = useCreateProject();
  const updateMutation = useUpdateProject();
  const activateMutation = useActivateProject();

  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const projects = data?.items ?? [];
  const activeProjectId = data?.activeProjectId ?? null;

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
              return (
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
                      </div>
                    )}
                  </td>
                </tr>
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
