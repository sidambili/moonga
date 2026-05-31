import { useState } from "react";
import {
  useListIntegrations,
  useUpsertIntegration,
  useListIntegrationRepos,
  getListIntegrationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Check, GitBranch, ChevronsUpDown, ChevronRight } from "lucide-react";
import { SourceIcon } from "@/components/ui-helpers";
import { toast } from "@/hooks/use-toast";

const PROVIDERS = [
  { id: "github",      label: "GitHub",       description: "Webhook events & codebase access" },
  { id: "linear",      label: "Linear",       description: "Ticket creation, status changes, comments" },
  { id: "sentry",      label: "Sentry",       description: "Error events, issue alerts, performance issues" },
  { id: "betterstack", label: "Better Stack", description: "Uptime monitors, incident alerts, log anomalies" },
  { id: "slack",       label: "Slack",        description: "Message events, slash commands, approvals" },
  { id: "email",       label: "Email",        description: "Notification delivery for approvals and summaries" },
];

type CurrentIntegration = {
  enabled?: boolean;
  api_key_masked?: string | null;
  webhook_secret?: boolean | string | null;
  config?: unknown;
} | undefined;

function getWebhookUrl(provider: string) {
  return `${window.location.origin}/api/webhooks/${provider}`;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex-shrink-0"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function WebhookUrlField({ provider }: { provider: string }) {
  const url = getWebhookUrl(provider);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">Webhook URL</Label>
      <div className="flex items-center gap-1 bg-muted/40 rounded-md border border-border px-3 py-2">
        <code className="text-xs flex-1 truncate min-w-0">{url}</code>
        <CopyButton value={url} />
      </div>
    </div>
  );
}

function SecretInput({
  label, placeholder, value, onChange, isSet, hint, masked,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  isSet?: boolean;
  hint?: string;
  masked?: string | null;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        {label}
        {isSet && <span className="text-emerald-500 font-normal text-[11px]">— set</span>}
      </Label>
      <Input
        type="password"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-muted/40 border-border text-sm"
      />
      {masked && <p className="text-[11px] text-emerald-600 dark:text-emerald-400">Current: {masked}</p>}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

const EVENT_TYPE_OPTIONS = [
  { key: "issues" as const,        label: "Issues" },
  { key: "pull_requests" as const, label: "Pull Requests" },
  { key: "releases" as const,      label: "Releases" },
];

function IntegrationConfig({
  provider,
  current,
  onSaved,
}: {
  provider: (typeof PROVIDERS)[0];
  current: CurrentIntegration;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const upsertMutation = useUpsertIntegration();

  const [apiKey, setApiKey]               = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [enabled, setEnabled]             = useState(current?.enabled ?? false);
  const [selectedRepo, setSelectedRepo]   = useState<string>(
    (current?.config as { selected_repo?: string } | null)?.selected_repo ?? ""
  );
  const [eventTypes, setEventTypes] = useState(() => {
    const cfg = (current?.config ?? {}) as Record<string, unknown>;
    const et  = (cfg.event_types ?? {}) as Record<string, boolean>;
    return {
      issues:        et.issues        ?? true,
      pull_requests: et.pull_requests ?? true,
      releases:      et.releases      ?? true,
    };
  });
  const [linearTeamNames,    setLinearTeamNames]    = useState<string>(
    (current?.config as { linear_team_names?: string } | null)?.linear_team_names ?? ""
  );
  const [linearDefaultRepo, setLinearDefaultRepo] = useState<string>(
    (current?.config as { default_repo?: string } | null)?.default_repo ?? ""
  );

  const { data: repos, isLoading: reposLoading } = useListIntegrationRepos(
    provider.id === "github" && current?.api_key_masked ? provider.id : ""
  );

  const handleSave = () => {
    upsertMutation.mutate(
      {
        provider: provider.id,
        data: {
          enabled,
          api_key:        apiKey        || undefined,
          webhook_secret: webhookSecret || undefined,
          config:
            provider.id === "github"
              ? { selected_repo: selectedRepo || undefined, event_types: eventTypes }
              : provider.id === "linear"
              ? { linear_team_names: linearTeamNames || undefined, default_repo: linearDefaultRepo || undefined }
              : undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: `${provider.label} saved` });
          queryClient.invalidateQueries({ queryKey: getListIntegrationsQueryKey() });
          onSaved();
        },
      }
    );
  };

  return (
    <>
      {/* Dialog header — pr-12 leaves room for the built-in close button */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-4 pr-12 border-b border-border">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${enabled ? "bg-primary/10" : "bg-muted"}`}>
          <SourceIcon
            source={provider.id}
            className={`w-4 h-4 ${enabled ? "text-primary" : "text-muted-foreground"}`}
          />
        </div>
        <div className="flex-1 min-w-0">
          <DialogTitle className="text-sm font-semibold leading-none">{provider.label}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1">{provider.description}</DialogDescription>
        </div>
        <label className="flex items-center gap-2 cursor-pointer flex-shrink-0">
          <span className="text-xs text-muted-foreground">{enabled ? "Enabled" : "Disabled"}</span>
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            className="data-[state=checked]:bg-primary"
          />
        </label>
      </div>

      {/* Scrollable form body */}
      <ScrollArea className="max-h-[60vh]">
        <div className="px-5 py-5 space-y-5">

          {/* API key / bot token */}
          {provider.id === "slack" ? (
            <SecretInput
              label="Bot User OAuth Token"
              placeholder="xoxb-..."
              value={apiKey}
              onChange={setApiKey}
              isSet={!!current?.api_key_masked}
              masked={current?.api_key_masked}
              hint="Used to post messages back to Slack channels."
            />
          ) : (
            <SecretInput
              label="API Key"
              placeholder={current?.api_key_masked ? "Enter new key to rotate…" : "Enter API key…"}
              value={apiKey}
              onChange={setApiKey}
              isSet={!!current?.api_key_masked}
              masked={current?.api_key_masked}
            />
          )}

          {/* GitHub */}
          {provider.id === "github" && (
            <>
              <div className="pt-5 border-t border-border space-y-4">
                <p className="text-xs font-medium">Incoming Events</p>
                <WebhookUrlField provider={provider.id} />
                <SecretInput
                  label="Webhook Secret"
                  placeholder="Enter signing secret…"
                  value={webhookSecret}
                  onChange={setWebhookSecret}
                  isSet={!!current?.webhook_secret}
                />
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Receive events for</Label>
                  <div className="flex flex-wrap gap-4">
                    {EVENT_TYPE_OPTIONS.map(({ key, label }) => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer">
                        <Switch
                          checked={eventTypes[key]}
                          onCheckedChange={(checked) => setEventTypes((prev) => ({ ...prev, [key]: checked }))}
                          className="data-[state=checked]:bg-primary scale-75 origin-left"
                        />
                        <span className="text-xs text-muted-foreground">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-5 border-t border-border space-y-3">
                <p className="text-xs font-medium">Codebase Access</p>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <GitBranch className="w-3 h-3" />
                    Primary Repository
                    {selectedRepo && <span className="text-emerald-500 font-normal">({selectedRepo})</span>}
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="w-full justify-between bg-muted/40 border-border text-sm h-9 font-normal"
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
                            <CommandItem value="__none__" onSelect={() => setSelectedRepo("")} className="text-sm">
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
          )}

          {/* Linear */}
          {provider.id === "linear" && (
            <>
              <div className="pt-5 border-t border-border space-y-4">
                <p className="text-xs font-medium">Webhook</p>
                <WebhookUrlField provider={provider.id} />
                <SecretInput
                  label="Webhook Secret"
                  placeholder="Enter signing secret…"
                  value={webhookSecret}
                  onChange={setWebhookSecret}
                  isSet={!!current?.webhook_secret}
                />
              </div>
              <div className="pt-5 border-t border-border space-y-4">
                <p className="text-xs font-medium">Configuration</p>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Engineering Team Names</Label>
                  <Input
                    placeholder="e.g. Engineering, Platform, SRE"
                    value={linearTeamNames}
                    onChange={(e) => setLinearTeamNames(e.target.value)}
                    className="bg-muted/40 border-border text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">Comma-separated. Only these teams trigger the agent.</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Default Repository</Label>
                  <Input
                    placeholder="owner/repo"
                    value={linearDefaultRepo}
                    onChange={(e) => setLinearDefaultRepo(e.target.value)}
                    className="bg-muted/40 border-border text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">GitHub repo for code context when tickets have no linked repo.</p>
                </div>
              </div>
            </>
          )}

          {/* Slack */}
          {provider.id === "slack" && (
            <div className="pt-5 border-t border-border space-y-4">
              <p className="text-xs font-medium">Events API</p>
              <WebhookUrlField provider={provider.id} />
              <SecretInput
                label="Signing Secret"
                placeholder="Enter Slack signing secret…"
                value={webhookSecret}
                onChange={setWebhookSecret}
                isSet={!!current?.webhook_secret}
                hint="From Slack App → Basic Information → Signing Secret."
              />
            </div>
          )}

          {/* Sentry / Better Stack */}
          {(provider.id === "sentry" || provider.id === "betterstack") && (
            <div className="pt-5 border-t border-border space-y-4">
              <p className="text-xs font-medium">Webhook</p>
              <WebhookUrlField provider={provider.id} />
              <SecretInput
                label="Webhook Secret"
                placeholder="Enter signing secret…"
                value={webhookSecret}
                onChange={setWebhookSecret}
                isSet={!!current?.webhook_secret}
              />
            </div>
          )}

        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-border">
        <Button onClick={handleSave} disabled={upsertMutation.isPending} className="w-full">
          {upsertMutation.isPending ? "Saving…" : "Save Configuration"}
        </Button>
      </div>
    </>
  );
}

export default function Integrations() {
  const [openProvider, setOpenProvider] = useState<string | null>(null);
  const { data: integrationsRaw, isLoading } = useListIntegrations();
  const integrations = Array.isArray(integrationsRaw) ? integrationsRaw : [];

  const activeCount        = integrations.filter((i) => i.enabled).length;
  const selectedProviderDef = PROVIDERS.find((p) => p.id === openProvider);
  const currentIntegration  = integrations.find((i) => i.provider === openProvider);

  return (
    <div className="px-5 py-5 max-w-6xl mx-auto space-y-5">

      {/* Provider list */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Integrations</span>
            {activeCount > 0 && (
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded tabular-nums">
                {activeCount} active
              </span>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {PROVIDERS.map((provider) => {
                const integration  = integrations.find((i) => i.provider === provider.id);
                const isActive     = integration?.enabled ?? false;
                const isConfigured = !!(integration?.api_key_masked || integration?.webhook_secret);

                return (
                  <tr
                    key={provider.id}
                    className="hover:bg-muted/40 transition-colors cursor-pointer"
                    onClick={() => setOpenProvider(provider.id)}
                  >
                    <td className="px-4 py-3.5 w-12">
                      <div className={`w-8 h-8 rounded-md flex items-center justify-center ${isActive ? "bg-primary/10" : "bg-muted"}`}>
                        <SourceIcon
                          source={provider.id}
                          className={`w-4 h-4 ${isActive ? "text-primary" : "text-muted-foreground"}`}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="text-sm font-medium">{provider.label}</p>
                      <p className="text-xs text-muted-foreground">{provider.description}</p>
                    </td>
                    <td className="px-4 py-3.5 w-28 hidden sm:table-cell">
                      {isConfigured && (
                        <span className="text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                          Configured
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 w-28">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isActive ? "bg-emerald-500" : "bg-muted-foreground/25"}`} />
                        <span className={`text-xs ${isActive ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                          {isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 w-10">
                      <ChevronRight className="w-4 h-4 text-muted-foreground/25 ml-auto" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Configuration dialog */}
      <Dialog open={!!openProvider} onOpenChange={(open) => !open && setOpenProvider(null)}>
        <DialogContent className="max-w-xl p-0 gap-0 overflow-hidden">
          {selectedProviderDef && (
            <IntegrationConfig
              key={openProvider ?? ""}
              provider={selectedProviderDef}
              current={currentIntegration}
              onSaved={() => setOpenProvider(null)}
            />
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
