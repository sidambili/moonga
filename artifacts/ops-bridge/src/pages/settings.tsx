import { useState, useEffect } from "react";
import {
  useGetModelSettings,
  useUpdateModelSettings,
  getGetModelSettingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Settings, KeyRound, Cpu, CheckCircle2 } from "lucide-react";
import { formatDate } from "@/lib/format";
import { toast } from "@/hooks/use-toast";

const PROVIDERS = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "custom", label: "Custom (OpenAI-compatible)" },
];

const MODEL_SUGGESTIONS: Record<string, { triage: string[]; plan: string[] }> =
  {
    openai: {
      triage: ["gpt-5.4-mini", "gpt-5.3-codex", "gpt-5.5"],
      plan: ["gpt-5.4-mini", "gpt-5.3-codex", "gpt-5.5"],
    },
    anthropic: {
      triage: ["claude-sonnet-4-6"],
      plan: ["claude-opus-4-8", "claude-sonnet-4-6"],
    },
    openrouter: {
      triage: [
        "qwen/qwen3.7-max",
        "google/gemini-3.5-flash",
        "deepseek/deepseek-v4-flash",
      ],
      plan: ["deepseek/deepseek-v4-pro", "moonshotai/kimi-k2.6"],
    },
    custom: { triage: ["your-triage-model"], plan: ["your-plan-model"] },
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
    updateMutation.mutate(
      {
        data: {
          provider,
          triage_model: triageModel,
          plan_model: planModel,
          api_key: apiKey || undefined,
          base_url: baseUrl || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Settings saved" });
          setApiKey("");
          queryClient.invalidateQueries({
            queryKey: getGetModelSettingsQueryKey(),
          });
        },
      },
    );
  };

  const suggestions = MODEL_SUGGESTIONS[provider] || MODEL_SUGGESTIONS.openai;

  if (isLoading)
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        <div className="text-sm text-muted-foreground animate-pulse">
          Loading settings…
        </div>
      </div>
    );

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <Settings className="w-5 h-5 text-primary" />
          Model Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          BYOK — bring your own key and route by task type
        </p>
      </div>

      <div className="rounded-xl bg-card border border-border/60 p-4 space-y-5">
        {settings && (
          <p className="text-xs text-muted-foreground">
            Last updated {formatDate(settings.updated_at)}
          </p>
        )}

        {/* Provider */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Provider</Label>
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger className="bg-muted/50 border-border/60 rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROVIDERS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Models */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            {
              label: "Triage Model",
              value: triageModel,
              set: setTriageModel,
              hints: suggestions.triage,
              desc: "Fast, cheap — classification and Slack summaries",
            },
            {
              label: "Plan Model",
              value: planModel,
              set: setPlanModel,
              hints: suggestions.plan,
              desc: "More capable — deep diagnosis and planning",
            },
          ].map((m) => (
            <div key={m.label} className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Cpu className="w-3 h-3" />
                {m.label}
              </Label>
              <Input
                value={m.value}
                onChange={(e) => m.set(e.target.value)}
                className="bg-muted/50 border-border/60 rounded-lg text-sm"
              />
              <div className="flex flex-wrap gap-1">
                {m.hints.map((h) => (
                  <button
                    key={h}
                    onClick={() => m.set(h)}
                    className="text-[10px] bg-muted/60 hover:bg-muted rounded-md px-2 py-0.5 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {h}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{m.desc}</p>
            </div>
          ))}
        </div>

        {/* API Key */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
            <KeyRound className="w-3 h-3" />
            API Key
            {settings?.api_key_set && (
              <span className="flex items-center gap-1 text-emerald-400 ml-1">
                <CheckCircle2 className="w-3 h-3" />
                set
              </span>
            )}
          </Label>
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="bg-muted/50 border-border/60 rounded-lg text-sm"
            placeholder={
              settings?.api_key_set ? "Enter new key to rotate…" : "sk-…"
            }
          />
        </div>

        {/* Base URL */}
        {(provider === "custom" || provider === "openrouter") && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Base URL</Label>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="bg-muted/50 border-border/60 rounded-lg text-sm"
              placeholder="https://api.openai.com/v1"
            />
            <p className="text-xs text-muted-foreground">
              OpenAI-compatible endpoint.
            </p>
          </div>
        )}

        <Button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="w-full rounded-lg"
        >
          {updateMutation.isPending ? "Saving…" : "Save Model Settings"}
        </Button>
      </div>

      {/* Routing info */}
      <div className="rounded-xl bg-card border border-border/60 p-4 space-y-3">
        <p className="text-xs font-medium text-muted-foreground">
          Routing Strategy
        </p>
        <div className="space-y-3">
          {[
            {
              tag: "Triage",
              desc: "Initial classification, severity assessment, and Slack summaries. Optimized for speed.",
            },
            {
              tag: "Plan",
              desc: "Deep diagnosis, implementation planning, and incident reports. Optimized for accuracy.",
            },
          ].map((r) => (
            <div key={r.tag} className="flex items-start gap-3">
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-primary/10 text-primary flex-shrink-0 mt-0.5">
                {r.tag}
              </span>
              <p className="text-xs text-muted-foreground">{r.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
