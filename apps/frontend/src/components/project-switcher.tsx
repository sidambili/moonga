import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { FolderGit2, Check, ChevronsUpDown, Settings2, Layers } from "lucide-react";
import {
  useListProjects,
  useActivateProject,
  useDeactivateProject,
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
 * Topbar project picker, scoped to the active org. Selecting a project sets the
 * caller's active project (POST /projects/{id}/activate); "All Projects" clears it
 * (POST /projects/deactivate). Operational reads (events / sessions / artifacts)
 * scope to the active project, or the whole org when "All Projects" is selected —
 * see lib/tenant-scope.ts. Invalidating all queries on change refetches those views.
 *
 * The list refetches when the org changes because OrgSwitcher invalidates all
 * queries on setActive. Hidden when the active org has no projects.
 */
export function ProjectSwitcher() {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { data, isPending } = useListProjects();
  const activateMutation = useActivateProject();
  const deactivateMutation = useDeactivateProject();

  const projects = data?.items ?? [];
  if (isPending || projects.length === 0) {
    return null;
  }

  const active = projects.find((p) => p.id === data?.activeProjectId) ?? null;
  const busy = activateMutation.isPending || deactivateMutation.isPending;

  const handleSelect = (id: string) => {
    if (id === active?.id || busy) return;
    activateMutation.mutate(
      { id },
      {
        onSuccess: () => queryClient.invalidateQueries(),
        onError: (err) => console.error("Failed to switch project:", err),
      },
    );
  };

  const handleSelectAll = () => {
    if (!active || busy) return;
    deactivateMutation.mutate(undefined, {
      onSuccess: () => queryClient.invalidateQueries(),
      onError: (err) => console.error("Failed to clear project:", err),
    });
  };

  return (
    <>
      <span className="text-muted-foreground/40 text-sm">/</span>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {active ? (
            <FolderGit2 className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <Layers className="w-3.5 h-3.5 text-muted-foreground" />
          )}
          <span className="truncate max-w-40">{active?.name ?? "All Projects"}</span>
          <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Projects</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={handleSelectAll}
            className="flex items-center justify-between gap-2 cursor-pointer"
          >
            <span className="flex items-center gap-2 truncate">
              <Layers className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              All Projects
            </span>
            <Check
              className={cn(
                "w-3.5 h-3.5 shrink-0",
                !active ? "opacity-100 text-primary" : "opacity-0"
              )}
            />
          </DropdownMenuItem>
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
    </>
  );
}
