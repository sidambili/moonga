import { useState, useEffect } from "react";
import { useGetModelSettings, useUpdateModelSettings, getGetModelSettingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings, KeyRound, Cpu, CheckCircle2 } from "lucide-react";
import { formatDate } from "@/lib/format";
import { toast } from "@/hooks/use-toast";

const PROVIDERS = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "custom", label: "Custom (OpenAI-compatible)" },
];

const MODEL_SUGGESTIONS: Record<string, { triage: string[]; plan: string[] }> = {
  openai: {
    triage: ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"],
    plan: ["gpt-4o", "gpt-4-turbo", "gpt-4o-mini"],
  },
  anthropic: {
    triage: ["claude-3-haiku-20240307", "claude-3-sonnet-20240229"],
    plan: ["claude-3-5-sonnet-20241022", "claude-3-opus-20240229"],
  },
  openrouter: {
    triage: ["openai/gpt-4o-mini", "anthropic/claude-3-haiku"],
    plan: ["openai/gpt-4o", "anthropic/claude-3.5-sonnet"],
  },
  custom: {
    triage: ["your-triage-model"],
    plan: ["your-plan-model"],
  },
};

export default function ModelSettings() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetModelSettings();
  const updateMutation = useUpdateModelSettings();

  const [provider, setProvider] = useState("openai");
  const [triageModel, setTriageModel] = useState("gpt-4o-mini");
  const [planModel, setPlanModel] = useState("gpt-4o");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");

  useEffect(() => {
    if (settings) {
      setProvider(settings.provider);
      setTriageModel(settings.triage_model);
      setPlanModel(settings.plan_model);
      setBaseUrl(settings.base_url || "");
    }
  }, [settings]);

  const handleSave = () => {
    updateMutation.mutate({
      data: {
        provider,
        triage_model: triageModel,
        plan_model: planModel,
        api_key: apiKey || undefined,
        base_url: baseUrl || undefined,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Model settings saved" });
        setApiKey("");
        queryClient.invalidateQueries({ queryKey: getGetModelSettingsQueryKey() });
      },
    });
  };

  const suggestions = MODEL_SUGGESTIONS[provider] || MODEL_SUGGESTIONS.openai;

  if (isLoading) {
    return <div className="p-6 font-mono text-sm text-muted-foreground animate-pulse">Loading settings...</div>;
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Settings className="w-7 h-7 text-primary" />
          Model Settings
        </h1>
        <p className="text-muted-foreground text-sm font-mono mt-1">BYOK — bring your own key and route by task type</p>
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-mono text-muted-foreground uppercase">Current Configuration</CardTitle>
            {settings && (
              <span className="text-xs font-mono text-muted-foreground">Updated {formatDate(settings.updated_at)}</span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label className="text-xs font-mono text-muted-foreground uppercase">Provider</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger className="font-mono text-sm bg-muted/40 border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="font-mono">{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-mono text-muted-foreground uppercase flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5" />Triage Model
              </Label>
              <div className="space-y-1.5">
                <Input
                  value={triageModel}
                  onChange={(e) => setTriageModel(e.target.value)}
                  className="font-mono text-sm bg-muted/40 border-border"
                  placeholder="e.g. gpt-4o-mini"
                />
                <div className="flex flex-wrap gap-1">
                  {suggestions.triage.map((m) => (
                    <button
                      key={m}
                      onClick={() => setTriageModel(m)}
                      className="text-[10px] font-mono bg-muted/60 hover:bg-muted border border-border rounded px-1.5 py-0.5 transition-colors text-muted-foreground hover:text-foreground"
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Fast, cheap — used for triage and initial classification</p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-mono text-muted-foreground uppercase flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5" />Plan Model
              </Label>
              <div className="space-y-1.5">
                <Input
                  value={planModel}
                  onChange={(e) => setPlanModel(e.target.value)}
                  className="font-mono text-sm bg-muted/40 border-border"
                  placeholder="e.g. gpt-4o"
                />
                <div className="flex flex-wrap gap-1">
                  {suggestions.plan.map((m) => (
                    <button
                      key={m}
                      onClick={() => setPlanModel(m)}
                      className="text-[10px] font-mono bg-muted/60 hover:bg-muted border border-border rounded px-1.5 py-0.5 transition-colors text-muted-foreground hover:text-foreground"
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">More capable — used for implementation planning and diagnosis</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-mono text-muted-foreground uppercase flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5" />API Key
              {settings?.api_key_set && (
                <Badge variant="outline" className="text-[10px] font-mono text-green-500 border-green-500/20 ml-1">
                  <CheckCircle2 className="w-2.5 h-2.5 mr-1" />SET
                </Badge>
              )}
            </Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="font-mono text-sm bg-muted/40 border-border"
              placeholder={settings?.api_key_set ? "Enter new key to rotate..." : "sk-..."}
            />
          </div>

          {provider === "custom" || provider === "openrouter" ? (
            <div className="space-y-2">
              <Label className="text-xs font-mono text-muted-foreground uppercase">Base URL</Label>
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="font-mono text-sm bg-muted/40 border-border"
                placeholder="https://api.openai.com/v1"
              />
              <p className="text-xs text-muted-foreground">OpenAI-compatible endpoint. Required for custom and OpenRouter providers.</p>
            </div>
          ) : null}

          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="w-full font-mono"
          >
            {updateMutation.isPending ? "SAVING..." : "SAVE MODEL SETTINGS"}
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-card border-border border-muted-foreground/10">
        <CardContent className="pt-4">
          <div className="text-xs font-mono text-muted-foreground uppercase mb-3">Routing Strategy</div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-start gap-3">
              <Badge variant="outline" className="font-mono text-[10px] shrink-0 mt-0.5">TRIAGE</Badge>
              <span className="text-xs">Used for initial event classification, severity assessment, and generating Slack summaries. Optimized for speed and cost.</span>
            </div>
            <div className="flex items-start gap-3">
              <Badge variant="outline" className="font-mono text-[10px] shrink-0 mt-0.5">PLAN</Badge>
              <span className="text-xs">Used for deep diagnosis, implementation planning, and generating incident reports. Optimized for accuracy and reasoning depth.</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
