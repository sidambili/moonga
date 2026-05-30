import { GitBranch, Layers, AlertTriangle, Activity, MessageSquare, Mail, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function SourceIcon({ source, className }: { source: string; className?: string }) {
  const normalized = source.toLowerCase();
  switch (normalized) {
    case "github": return <GitBranch className={className} />;
    case "linear": return <Layers className={className} />;
    case "sentry": return <AlertTriangle className={className} />;
    case "betterstack": return <Activity className={className} />;
    case "slack": return <MessageSquare className={className} />;
    case "email": return <Mail className={className} />;
    default: return <HelpCircle className={className} />;
  }
}

export function SeverityBadge({ severity }: { severity: string }) {
  const norm = severity.toLowerCase();
  
  if (norm === "critical") return <Badge variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20 uppercase text-[10px]">Critical</Badge>;
  if (norm === "high") return <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/20 hover:bg-orange-500/20 uppercase text-[10px]">High</Badge>;
  if (norm === "medium") return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20 hover:bg-yellow-500/20 uppercase text-[10px]">Medium</Badge>;
  
  return <Badge variant="secondary" className="uppercase text-[10px] bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500/20">{severity}</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  const norm = status.toLowerCase();
  
  if (["failed", "rejected", "error"].includes(norm)) {
    return <Badge variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20 uppercase text-[10px]">{status}</Badge>;
  }
  if (["completed", "approved", "processed"].includes(norm)) {
    return <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20 uppercase text-[10px]">{status}</Badge>;
  }
  if (["running", "processing", "needs_review"].includes(norm)) {
    return <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 uppercase text-[10px]">{status}</Badge>;
  }
  
  return <Badge variant="outline" className="uppercase text-[10px]">{status}</Badge>;
}
