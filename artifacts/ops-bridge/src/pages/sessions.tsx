import { useState } from "react";
import { useListSessions } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatRelative } from "@/lib/format";
import { SourceIcon, StatusBadge } from "@/components/ui-helpers";
import { Link } from "wouter";
import { Cpu } from "lucide-react";

function ObjectiveBadge({ objective }: { objective: string }) {
  const colors: Record<string, string> = {
    diagnose: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    plan: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    summarize: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    draft: "bg-teal-500/10 text-teal-500 border-teal-500/20",
  };
  return (
    <Badge variant="outline" className={`uppercase text-[10px] font-mono ${colors[objective] || ""}`}>
      {objective}
    </Badge>
  );
}

function ConfidenceLabel({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="text-muted-foreground font-mono text-xs">—</span>;
  const pct = Math.round(score * 100);
  const color = score >= 0.8 ? "text-green-500" : score >= 0.6 ? "text-yellow-500" : "text-orange-500";
  return <span className={`font-mono text-xs ${color}`}>{pct}%</span>;
}

export default function Sessions() {
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: sessionsList, isLoading } = useListSessions({
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: 50,
  }, { query: { refetchInterval: 15000 } });

  const items = sessionsList?.items ?? [];

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:justify-between md:items-center">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-3">
            <Cpu className="w-6 h-6 md:w-7 md:h-7 text-primary" />
            Agent Sessions
          </h1>
          <p className="text-muted-foreground text-xs font-mono mt-1">AI work units — one per event</p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px] font-mono text-xs h-8">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ALL STATUSES</SelectItem>
            <SelectItem value="pending">PENDING</SelectItem>
            <SelectItem value="running">RUNNING</SelectItem>
            <SelectItem value="needs_review">NEEDS REVIEW</SelectItem>
            <SelectItem value="approved">APPROVED</SelectItem>
            <SelectItem value="rejected">REJECTED</SelectItem>
            <SelectItem value="completed">COMPLETED</SelectItem>
            <SelectItem value="failed">FAILED</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-2">
        {isLoading ? (
          <div className="text-center text-muted-foreground font-mono text-sm py-12">Loading sessions...</div>
        ) : items.length === 0 ? (
          <div className="text-center text-muted-foreground font-mono text-sm py-12">No sessions found.</div>
        ) : (
          items.map((session) => (
            <Link key={session.id} href={`/sessions/${session.id}`}>
              <Card className="bg-card/60 border-border active:bg-muted/30 transition-colors cursor-pointer">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ObjectiveBadge objective={session.objective} />
                      <span className="text-xs text-muted-foreground font-mono">#{session.id}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ConfidenceLabel score={session.confidence_score} />
                      <StatusBadge status={session.status} />
                    </div>
                  </div>
                  <div className="text-sm font-medium line-clamp-2">
                    {session.output_summary
                      ? session.output_summary.slice(0, 100) + (session.output_summary.length > 100 ? "..." : "")
                      : <span className="text-muted-foreground italic text-xs">In progress...</span>
                    }
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    {session.event && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <SourceIcon source={session.event.source} className="w-3.5 h-3.5" />
                        <span className="capitalize">{session.event.source}</span>
                        <span>• Event #{session.event_id}</span>
                      </div>
                    )}
                    <span className="text-xs text-muted-foreground font-mono ml-auto flex-shrink-0">{formatRelative(session.updated_at)}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <Card className="border-border">
          <div className="rounded-md border border-border overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[80px] font-mono text-xs">ID</TableHead>
                  <TableHead className="w-[110px] font-mono text-xs">OBJECTIVE</TableHead>
                  <TableHead className="font-mono text-xs">SUMMARY</TableHead>
                  <TableHead className="w-[120px] font-mono text-xs">SOURCE</TableHead>
                  <TableHead className="w-[130px] font-mono text-xs">STATUS</TableHead>
                  <TableHead className="w-[80px] font-mono text-xs">CONF.</TableHead>
                  <TableHead className="w-[130px] text-right font-mono text-xs">UPDATED</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground font-mono text-sm">
                      Loading sessions...
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground font-mono text-sm">
                      No sessions found.
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((session) => (
                    <TableRow key={session.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        <Link href={`/sessions/${session.id}`} className="hover:text-primary transition-colors">
                          #{session.id}
                        </Link>
                      </TableCell>
                      <TableCell><ObjectiveBadge objective={session.objective} /></TableCell>
                      <TableCell>
                        <Link href={`/sessions/${session.id}`} className="hover:underline decoration-primary underline-offset-4">
                          <div className="text-sm font-medium line-clamp-1">
                            {session.output_summary
                              ? session.output_summary.slice(0, 80) + (session.output_summary.length > 80 ? "..." : "")
                              : <span className="text-muted-foreground italic text-xs">In progress...</span>
                            }
                          </div>
                        </Link>
                        {session.event && (
                          <div className="text-xs text-muted-foreground font-mono mt-0.5">
                            Event #{session.event_id} — {session.event.title?.slice(0, 50) || session.event.event_type}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {session.event && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <SourceIcon source={session.event.source} className="w-3.5 h-3.5" />
                            <span className="capitalize">{session.event.source}</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell><StatusBadge status={session.status} /></TableCell>
                      <TableCell><ConfidenceLabel score={session.confidence_score} /></TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground font-mono">
                        {formatRelative(session.updated_at)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </div>
  );
}
