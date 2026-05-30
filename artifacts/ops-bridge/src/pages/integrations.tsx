import { useState } from "react";
import { useListIntegrations, useUpsertIntegration, getListIntegrationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Webhook, Copy, Check } from "lucide-react";
import { SourceIcon } from "@/components/ui-helpers";
import { toast } from "@/hooks/use-toast";

const PROVIDERS = [
  { id: "github", label: "GitHub", description: "Push events, pull requests, issue updates" },
  { id: "linear", label: "Linear", description: "Ticket creation, status changes, comments" },
  { id: "sentry", label: "Sentry", description: "Error events, issue alerts, performance issues" },
  { id: "betterstack", label: "Better Stack", description: "Uptime monitors, incident alerts, log anomalies" },
  { id: "slack", label: "Slack", description: "Message events, slash commands, approvals" },
  { id: "email", label: "Email", description: "Notification delivery for approvals and summaries" },
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
    <button onClick={handleCopy} className="ml-1 p-1 rounded hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground">
      {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

function IntegrationCard({ provider }: { provider: typeof PROVIDERS[0] }) {
  const queryClient = useQueryClient();
  const { data: integrations } = useListIntegrations();
  const upsertMutation = useUpsertIntegration();

  const current = integrations?.find((i) => i.provider === provider.id);
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [enabled, setEnabled] = useState(current?.enabled ?? false);

  const webhookUrl = getWebhookUrl(provider.id);

  const handleSave = () => {
    upsertMutation.mutate({
      provider: provider.id,
      data: {
        enabled,
        api_key: apiKey || undefined,
        webhook_secret: webhookSecret || undefined,
      }
    }, {
      onSuccess: () => {
        toast({ title: `${provider.label} integration saved` });
        setApiKey("");
        setWebhookSecret("");
        queryClient.invalidateQueries({ queryKey: getListIntegrationsQueryKey() });
      },
    });
  };

  const isEnabled = current?.enabled ?? enabled;

  return (
    <Card className={`bg-card border-border transition-all ${isEnabled ? "border-primary/20" : ""}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-md ${isEnabled ? "bg-primary/10" : "bg-muted/40"}`}>
              <SourceIcon source={provider.id} className={`w-5 h-5 ${isEnabled ? "text-primary" : "text-muted-foreground"}`} />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">{provider.label}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{provider.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-[10px] font-mono uppercase ${isEnabled ? "text-green-500 border-green-500/20" : "text-muted-foreground"}`}>
              {isEnabled ? "ACTIVE" : "INACTIVE"}
            </Badge>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              className="data-[state=checked]:bg-primary"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {provider.id !== "email" && (
          <div className="space-y-1.5">
            <Label className="text-xs font-mono text-muted-foreground uppercase">Webhook URL</Label>
            <div className="flex items-center gap-1 bg-muted/40 rounded-md border border-border px-3 py-2">
              <code className="text-xs font-mono text-foreground flex-1 truncate">{webhookUrl}</code>
              <CopyButton value={webhookUrl} />
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs font-mono text-muted-foreground uppercase">
            API Key {current?.api_key_masked && <span className="text-green-500 ml-1">(set: {current.api_key_masked})</span>}
          </Label>
          <Input
            type="password"
            placeholder="Enter new API key to update..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="font-mono text-xs bg-muted/40 border-border"
          />
        </div>

        {provider.id !== "email" && (
          <div className="space-y-1.5">
            <Label className="text-xs font-mono text-muted-foreground uppercase">
              Webhook Secret {current?.webhook_secret && <span className="text-green-500 ml-1">(set)</span>}
            </Label>
            <Input
              type="password"
              placeholder="Enter signing secret..."
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              className="font-mono text-xs bg-muted/40 border-border"
            />
          </div>
        )}

        <Button
          onClick={handleSave}
          disabled={upsertMutation.isPending}
          className="w-full font-mono text-xs"
          size="sm"
        >
          {upsertMutation.isPending ? "SAVING..." : "SAVE CONFIGURATION"}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function Integrations() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Webhook className="w-7 h-7 text-primary" />
          Integrations
        </h1>
        <p className="text-muted-foreground text-sm font-mono mt-1">Connect your tools — webhooks receive events, API keys enable actions</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PROVIDERS.map((provider) => (
          <IntegrationCard key={provider.id} provider={provider} />
        ))}
      </div>
    </div>
  );
}
