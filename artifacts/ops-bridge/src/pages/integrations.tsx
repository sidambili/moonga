import { useState, useEffect, useRef } from "react";
import { useListIntegrations, useUpsertIntegration, useListIntegrationRepos, getListIntegrationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Webhook, Copy, Check, GitBranch, ChevronsUpDown } from "lucide-react";
import { SourceIcon } from "@/components/ui-helpers";
import { toast } from "@/hooks/use-toast";

const PROVIDERS = [
  { id: "github",      label: "GitHub",       description: "Webhook events & codebase access — two integrations in one" },
  { id: "linear",      label: "Linear",       description: "Ticket creation, status changes, comments" },
  { id: "sentry",      label: "Sentry",       description: "Error events, issue alerts, performance issues" },
  { id: "betterstack", label: "Better Stack", description: "Uptime monitors, incident alerts, log anomalies" },
  { id: "slack",       label: "Slack",        description: "Message events, slash commands, approvals" },
  { id: "email",       label: "Email",        description: "Notification delivery for approvals and summaries" },
];

function getWebhookUrl(provider: string) {
  return `${window.location.origin}/api/webhooks/${provider}`;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button onClick={handleCopy} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function IntegrationCard({ provider }: { provider: typeof PROVIDERS[0] }) {
  const queryClient = useQueryClient();
  const { data: integrationsRaw, isLoading, isError } = useListIntegrations();
  const upsertMutation = useUpsertIntegration();

  const integrations = Array.isArray(integrationsRaw) ? integrationsRaw : [];
  const current = integrations.find((i) => i.provider === provider.id);
  const [apiKey, setApiKey]               = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [enabled, setEnabled]             = useState(current?.enabled ?? false);
  const [selectedRepo, setSelectedRepo]   = useState<string>((current?.config as { selected_repo?: string } | null)?.selected_repo ?? "");
  const [eventTypes, setEventTypes] = useState(() => {
    const cfg = (current?.config ?? {}) as Record<string, unknown>;
    const et = (cfg.event_types ?? {}) as Record<string, boolean>;
    return {
      issues: et.issues ?? true,
      pull_requests: et.pull_requests ?? true,
      releases: et.releases ?? true,
    };
  });

  const hasSynced = useRef(false);
  useEffect(() => {
    if (current && !hasSynced.current) {
      hasSynced.current = true;
      setEnabled(current.enabled);
      setSelectedRepo((current.config as { selected_repo?: string } | null)?.selected_repo ?? "");
      const cfg = (current.config ?? {}) as Record<string, unknown>;
      const et = (cfg.event_types ?? {}) as Record<string, boolean>;
      setEventTypes({
        issues: et.issues ?? true,
        pull_requests: et.pull_requests ?? true,
        releases: et.releases ?? true,
      });
    }
  }, [current]);

  const { data: repos, isLoading: reposLoading } = useListIntegrationRepos(
    provider.id === "github" && current?.api_key_masked ? provider.id : ""
  );

  if (isLoading) {
    return (
      <div className="rounded-xl bg-card border border-border/60 p-4 space-y-4 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-muted" />
          <div className="space-y-1.5 flex-1">
            <div className="h-4 w-24 bg-muted rounded" />
            <div className="h-3 w-48 bg-muted rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl bg-card border border-destructive/25 p-4">
        <p className="text-sm text-destructive">Failed to load integration data.</p>
      </div>
    );
  }

  const isEnabled = current?.enabled ?? enabled;
  const webhookUrl = getWebhookUrl(provider.id);

  const handleSave = () => {
    upsertMutation.mutate({
      provider: provider.id,
      data: {
        enabled,
        api_key: apiKey || undefined,
        webhook_secret: webhookSecret || undefined,
        config: provider.id === "github" ? { selected_repo: selectedRepo || undefined, event_types: eventTypes } : undefined,
      }
    }, {
      onSuccess: () => {
        toast({ title: `${provider.label} saved` });
        setApiKey("");
        setWebhookSecret("");
        queryClient.invalidateQueries({ queryKey: getListIntegrationsQueryKey() });
      },
    });
  };

  return (
    <div className={`rounded-xl bg-card border p-4 space-y-4 transition-colors ${isEnabled ? "border-primary/25" : "border-border/60"}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isEnabled ? "bg-primary/10" : "bg-muted"}`}>
            <SourceIcon source={provider.id} className={`w-4 h-4 ${isEnabled ? "text-primary" : "text-muted-foreground"}`} />
          </div>
          <div>
            <p className="text-sm font-medium">{provider.label}</p>
            <p className="text-xs text-muted-foreground">{provider.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-medium ${isEnabled ? "text-emerald-400" : "text-muted-foreground"}`}>
            {isEnabled ? "Active" : "Inactive"}
          </span>
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            className="data-[state=checked]:bg-primary"
          />
        </div>
      </div>

      {/* API Key */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">
          API Key
          {current?.api_key_masked && (
            <span className="text-emerald-400 ml-1.5">(set: {current.api_key_masked})</span>
          )}
        </Label>
        <Input
          type="password"
          placeholder="Enter new API key to update…"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          className="bg-muted/50 border-border/60 rounded-lg text-sm"
        />
      </div>

      {provider.id === "github" ? (
        <>
          {/* Incoming Events */}
          <div className="space-y-3 pt-2 border-t border-border/40">
            <p className="text-xs font-medium text-muted-foreground">Incoming Events</p>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Webhook URL</Label>
              <div className="flex items-center gap-1 bg-muted/50 rounded-lg border border-border/60 px-3 py-2">
                <code className="text-xs flex-1 truncate text-foreground">{webhookUrl}</code>
                <CopyButton value={webhookUrl} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Webhook Secret
                {current?.webhook_secret && <span className="text-emerald-400 ml-1.5">(set)</span>}
              </Label>
              <Input
                type="password"
                placeholder="Enter signing secret…"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                className="bg-muted/50 border-border/60 rounded-lg text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Receive events for</Label>
              <div className="flex flex-wrap gap-3">
                {[
                  { key: "issues" as const, label: "Issues" },
                  { key: "pull_requests" as const, label: "Pull Requests" },
                  { key: "releases" as const, label: "Releases" },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-1.5 cursor-pointer">
                    <Switch
                      checked={eventTypes[key]}
                      onCheckedChange={(checked) =>
                        setEventTypes((prev) => ({ ...prev, [key]: checked }))
                      }
                      className="data-[state=checked]:bg-primary scale-75 origin-left"
                    />
                    <span className="text-xs text-muted-foreground">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Codebase Access */}
          <div className="space-y-3 pt-2 border-t border-border/40">
            <p className="text-xs font-medium text-muted-foreground">Codebase Access</p>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <GitBranch className="w-3 h-3" />
                Primary Repository
                {selectedRepo && <span className="text-emerald-400 ml-1.5">({selectedRepo})</span>}
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between bg-muted/50 border-border/60 rounded-lg text-sm h-9 font-normal"
                    disabled={reposLoading}
                  >
                    <span className="truncate">
                      {selectedRepo || (reposLoading ? "Loading repositories…" : "Select a repository…")}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search repositories…" className="h-9" />
                    <CommandList>
                      <CommandEmpty>No repository found.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="__none__"
                          onSelect={() => setSelectedRepo("")}
                          className="text-sm"
                        >
                          <Check className={`mr-2 h-4 w-4 ${!selectedRepo ? "opacity-100" : "opacity-0"}`} />
                          None
                        </CommandItem>
                        {repos?.map((repo) => (
                          <CommandItem
                            key={repo.id}
                            value={repo.full_name}
                            onSelect={() => setSelectedRepo(repo.full_name)}
                            className="text-sm"
                          >
                            <Check className={`mr-2 h-4 w-4 ${selectedRepo === repo.full_name ? "opacity-100" : "opacity-0"}`} />
                            {repo.full_name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {!current?.api_key_masked && (
                <p className="text-[11px] text-muted-foreground">Add an API key above to load your repositories.</p>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Webhook URL */}
          {provider.id !== "email" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Webhook URL</Label>
              <div className="flex items-center gap-1 bg-muted/50 rounded-lg border border-border/60 px-3 py-2">
                <code className="text-xs flex-1 truncate text-foreground">{webhookUrl}</code>
                <CopyButton value={webhookUrl} />
              </div>
            </div>
          )}

          {/* Webhook Secret */}
          {provider.id !== "email" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Webhook Secret
                {current?.webhook_secret && <span className="text-emerald-400 ml-1.5">(set)</span>}
              </Label>
              <Input
                type="password"
                placeholder="Enter signing secret…"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                className="bg-muted/50 border-border/60 rounded-lg text-sm"
              />
            </div>
          )}
        </>
      )}

      <Button onClick={handleSave} disabled={upsertMutation.isPending} className="w-full rounded-lg text-sm" size="sm">
        {upsertMutation.isPending ? "Saving…" : "Save Configuration"}
      </Button>
    </div>
  );
}

export default function Integrations() {
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <Webhook className="w-5 h-5 text-primary" />
          Integrations
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Connect your tools — webhooks receive events, API keys enable actions</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {PROVIDERS.map((p) => (
          <IntegrationCard key={p.id} provider={p} />
        ))}
      </div>
    </div>
  );
}
