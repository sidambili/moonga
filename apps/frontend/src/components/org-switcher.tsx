import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/format";
import { authClient } from "@/lib/auth-client";

/**
 * Topbar organization switcher. Reads the active org + the user's org list from
 * better-auth's organization client plugin and switches via setActive. Switching
 * only changes session.activeOrganizationId today — until the runtime tenant
 * scoping layer reads it, the visible data is unchanged; we still invalidate all
 * queries so org-scoped views refetch once that layer lands.
 *
 * Single-org users see a static label (no dropdown affordance).
 */
export function OrgSwitcher() {
  const queryClient = useQueryClient();
  const { data: organizations, isPending } = authClient.useListOrganizations();
  const { data: activeOrg } = authClient.useActiveOrganization();
  const [switching, setSwitching] = useState(false);

  if (isPending || !organizations || organizations.length === 0) {
    return null;
  }

  const active = activeOrg ?? organizations[0];

  // Single org: nothing to switch to — render a plain label.
  if (organizations.length === 1) {
    return (
      <span className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
        <Building2 className="w-3.5 h-3.5" />
        <span className="truncate max-w-40">{active?.name}</span>
      </span>
    );
  }

  const handleSelect = async (organizationId: string) => {
    if (organizationId === active?.id || switching) return;
    setSwitching(true);
    try {
      await authClient.organization.setActive({ organizationId });
      // Org-scoped data may change once runtime scoping reads the active org.
      await queryClient.invalidateQueries();
    } catch (err) {
      console.error("Failed to switch organization:", err);
    } finally {
      setSwitching(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={switching}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-60 focus:outline-none"
      >
        <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="truncate max-w-40">{active?.name}</span>
        <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Organizations
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {organizations.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onSelect={() => handleSelect(org.id)}
            className="flex items-center justify-between gap-2 cursor-pointer"
          >
            <span className="truncate">{org.name}</span>
            <Check
              className={cn(
                "w-3.5 h-3.5 shrink-0",
                org.id === active?.id ? "opacity-100 text-primary" : "opacity-0"
              )}
            />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
