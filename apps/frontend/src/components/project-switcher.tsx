import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { FolderGit2, Check, ChevronsUpDown, Settings2 } from "lucide-react";
import {
  useListProjects,
  useActivateProject,
} from "@workspace/api-client-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/format";

/**
 * Topbar project picker, scoped to the active org. Lists the org's projects and
 * switches the caller's active project via POST /projects/{id}/activate. The list
 * refetches when the org changes because OrgSwitcher invalidates all queries on
 * setActive.
 *
 * Active project only changes session.activeProjectId today — write-scoping that
 * stamps new operational data with it is unbuilt — but we invalidate all queries
 * so scoped views refetch once that layer lands.
 *
 * Hidden when the active org has no projects; a single project renders as a plain
 * label.
 */
export function ProjectSwitcher() {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { data, isPending } = useListProjects();
  const activateMutation = useActivateProject();

  const projects = data?.items ?? [];
  if (isPending || projects.length === 0) {
    return null;
  }

  const active = projects.find((p) => p.id === data?.activeProjectId) ?? null;

  // Single project: nothing to switch to — render a plain label.
  if (projects.length === 1) {
    return (
      <span className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
        <FolderGit2 className="w-3.5 h-3.5" />
        <span className="truncate max-w-40">{projects[0].name}</span>
      </span>
    );
  }

  const handleSelect = (id: string) => {
    if (id === active?.id || activateMutation.isPending) return;
    activateMutation.mutate(
      { id },
      {
        // Active project may change scoped data once write-scoping reads it.
        onSuccess: () => queryClient.invalidateQueries(),
        onError: (err) => console.error("Failed to switch project:", err),
      },
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={activateMutation.isPending}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-60 focus:outline-none"
      >
        <FolderGit2 className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="truncate max-w-40">{active?.name ?? "Select project"}</span>
        <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Projects</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {projects.map((p) => (
          <DropdownMenuItem
            key={p.id}
            onSelect={() => handleSelect(p.id)}
            className="flex items-center justify-between gap-2 cursor-pointer"
          >
            <span className="truncate">{p.name}</span>
            <Check
              className={cn(
                "w-3.5 h-3.5 shrink-0",
                p.id === active?.id ? "opacity-100 text-primary" : "opacity-0"
              )}
            />
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => navigate("/settings")}
          className="flex items-center gap-2 cursor-pointer text-muted-foreground"
        >
          <Settings2 className="w-3.5 h-3.5" />
          Manage projects
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
