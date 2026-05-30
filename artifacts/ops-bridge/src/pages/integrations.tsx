import { useState } from "react";
import { useListIntegrations, useUpsertIntegration, getListIntegrationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Webhook, Copy, Check } from "lucide-react";
import { SourceIcon } from "@/components/ui-helpers";
import { toast } from "@/hooks/use-toast";

const PROVIDERS = [
  { id: "github",      label: "GitHub",       description: "Push events, pull requests, issue updates" },
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
  const { data: integrations } = useListIntegrations();
  const upsertMutation = useUpsertIntegration();

  const current = integrations?.find((i) => i.provider === provider.id);
  const [apiKey, setApiKey]               = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [enabled, setEnabled]             = useState(current?.enabled ?? false);

  const isEnabled = current?.enabled ?? enabled;
  const webhookUrl = getWebhookUrl(provider.id);

  const handleSave = () => {
    upsertMutation.mutate({
      provider: provider.id,
      data: { enabled, api_key: apiKey || undefined, webhook_secret: webhookSecret || undefined }
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
