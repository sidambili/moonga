import { useState } from "react";
import { useListSessions } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatRelative } from "@/lib/format";
import { SourceIcon, StatusBadge } from "@/components/ui-helpers";
import { Link } from "wouter";
import { Cpu, Brain } from "lucide-react";

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

export default function Sessions() {
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: sessionsList, isLoading } = useListSessions({
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: 50,
  }, { query: { refetchInterval: 15000 } });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Cpu className="w-7 h-7 text-primary" />
            Agent Sessions
          </h1>
          <p className="text-muted-foreground text-sm font-mono mt-1">AI work units — one per event</p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px] font-mono text-xs">
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

      <Card className="border-border">
        <div className="rounded-md border border-border">
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
              ) : sessionsList?.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground font-mono text-sm">
                    No sessions found.
                  </TableCell>
                </TableRow>
              ) : (
                sessionsList?.items.map((session) => (
                  <TableRow key={session.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      <Link href={`/sessions/${session.id}`} className="hover:text-primary transition-colors">
                        #{session.id}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <ObjectiveBadge objective={session.objective} />
                    </TableCell>
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
                    <TableCell>
                      {session.confidence_score != null ? (
                        <span className={`font-mono text-xs ${
                          session.confidence_score >= 0.8 ? "text-green-500" :
                          session.confidence_score >= 0.6 ? "text-yellow-500" : "text-orange-500"
                        }`}>
                          {Math.round(session.confidence_score * 100)}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground font-mono text-xs">—</span>
                      )}
                    </TableCell>
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
  );
}
