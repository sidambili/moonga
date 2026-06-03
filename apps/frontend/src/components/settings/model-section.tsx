import { useState, useEffect, useRef } from "react";
import {
  useGetModelSettings,
  useUpdateModelSettings,
  getGetModelSettingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KeyRound, Cpu, CheckCircle2 } from "lucide-react";
import { formatDate } from "@/lib/format";
import { toast } from "@/hooks/use-toast";
import {
  MODEL_PROVIDERS,
  MODEL_SUGGESTIONS,
  ROUTING_MODES,
} from "@workspace/constants";

export function ModelSection() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetModelSettings();
  const updateMutation = useUpdateModelSettings();

  const [provider, setProvider]         = useState("openai");
  const [triageModel, setTriageModel]   = useState("gpt-4o-mini");
  const [planModel, setPlanModel]       = useState("gpt-4o");
  const [apiKey, setApiKey]             = useState("");
  const [baseUrl, setBaseUrl]           = useState("");
  const hydrated = useRef(false);

  useEffect(() => {
    if (!settings || hydrated.current) return;
    setProvider(settings.provider);
    setTriageModel(settings.triage_model);
    setPlanModel(settings.plan_model);
    setBaseUrl(settings.base_url || "");
    hydrated.current = true;
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
          queryClient.invalidateQueries({ queryKey: getGetModelSettingsQueryKey() });
        },
      }
    );
  };

  const suggestions = MODEL_SUGGESTIONS[provider] ?? MODEL_SUGGESTIONS.openai;

  if (isLoading) {
    return (
      <div className="px-4 py-10 text-center text-sm text-muted-foreground">Loading…</div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">

      {/* Model configuration form */}
      <div className="lg:col-span-2">
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-medium">Model Configuration</span>
            {settings?.updated_at && (
              <span className="text-xs text-muted-foreground">
                Updated {formatDate(settings.updated_at)}
              </span>
            )}
          </div>

          <div className="divide-y divide-border">
            {/* Provider */}
            <div className="px-4 py-4 space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">Provider</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger className="bg-muted/40 border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODEL_PROVIDERS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Models */}
            <div className="px-4 py-4 space-y-3">
              <p className="text-xs font-medium text-muted-foreground">Models</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {[
                  {
                    label: "Triage Model",
                    value: triageModel,
                    set: setTriageModel,
                    hints: suggestions.triage,
                    desc: "Fast — classification and Slack summaries",
                  },
                  {
                    label: "Plan Model",
                    value: planModel,
                    set: setPlanModel,
                    hints: suggestions.plan,
                    desc: "Capable — deep diagnosis and planning",
                  },
                ].map((m) => (
                  <div key={m.label} className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <Cpu className="w-3 h-3" />
                      {m.label}
                    </Label>
                    <Input
                      value={m.value}
                      onChange={(e) => m.set(e.target.value)}
                      className="bg-muted/40 border-border text-sm"
                    />
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {m.hints.map((h) => (
                        <button
                          key={h}
                          onClick={() => m.set(h)}
                          className="text-[10px] bg-muted hover:bg-accent rounded px-2 py-0.5 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {h}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground">{m.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Authentication */}
            <div className="px-4 py-4 space-y-4">
              <p className="text-xs font-medium text-muted-foreground">Authentication</p>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <KeyRound className="w-3 h-3" />
                  API Key
                  {settings?.api_key_set && (
                    <span className="flex items-center gap-1 text-emerald-500 font-normal text-[11px]">
                      <CheckCircle2 className="w-3 h-3" />
                      set
                    </span>
                  )}
                </Label>
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="bg-muted/40 border-border text-sm"
                  placeholder={settings?.api_key_set ? "Enter new key to rotate…" : "sk-…"}
                />
              </div>

              {(provider === "custom" || provider === "openrouter") && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Base URL</Label>
                  <Input
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    className="bg-muted/40 border-border text-sm"
                    placeholder="https://api.openai.com/v1"
                  />
                  <p className="text-[11px] text-muted-foreground">OpenAI-compatible endpoint.</p>
                </div>
              )}
            </div>

            {/* Save */}
            <div className="px-4 py-4">
              <Button onClick={handleSave} disabled={updateMutation.isPending} className="w-full">
                {updateMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Right column */}
      <div className="lg:col-span-1 space-y-4">
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <span className="text-sm font-medium">Routing Logic</span>
          </div>
          <div className="p-4 space-y-4">
            {ROUTING_MODES.map((r) => (
              <div key={r.tag} className="flex items-start gap-3">
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-primary/10 text-primary shrink-0 mt-0.5">
                  {r.tag}
                </span>
                <p className="text-xs text-muted-foreground leading-relaxed">{r.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            BYOK — your API key is stored encrypted and never leaves your server. Model choices are applied immediately on next session.
          </p>
        </div>
      </div>

    </div>
  );
}
