import { useState } from "react";
import { useListEvents } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatRelative } from "@/lib/format";
import { SourceIcon, SeverityBadge, StatusBadge } from "@/components/ui-helpers";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function EventsFeed() {
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  const { data: eventsList, isLoading } = useListEvents({
    source: sourceFilter === "all" ? undefined : sourceFilter,
    severity: severityFilter === "all" ? undefined : severityFilter,
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: 50,
  }, { query: { refetchInterval: 15000 } });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Events Feed</h1>
          <p className="text-muted-foreground text-sm font-mono mt-1">Inbound intelligence stream</p>
        </div>
        
        <div className="flex gap-2 w-full md:w-auto">
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-[140px] font-mono text-xs">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ALL SOURCES</SelectItem>
              <SelectItem value="github">GitHub</SelectItem>
              <SelectItem value="linear">Linear</SelectItem>
              <SelectItem value="sentry">Sentry</SelectItem>
              <SelectItem value="betterstack">Better Stack</SelectItem>
              <SelectItem value="slack">Slack</SelectItem>
            </SelectContent>
          </Select>

          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-[140px] font-mono text-xs">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ALL SEVERITIES</SelectItem>
              <SelectItem value="critical">CRITICAL</SelectItem>
              <SelectItem value="high">HIGH</SelectItem>
              <SelectItem value="medium">MEDIUM</SelectItem>
              <SelectItem value="low">LOW</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="border-border bg-card shadow-sm">
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[80px] font-mono text-xs">ID</TableHead>
                <TableHead className="w-[120px] font-mono text-xs">SOURCE</TableHead>
                <TableHead className="font-mono text-xs">EVENT</TableHead>
                <TableHead className="w-[100px] font-mono text-xs">SEVERITY</TableHead>
                <TableHead className="w-[120px] font-mono text-xs">STATUS</TableHead>
                <TableHead className="w-[140px] text-right font-mono text-xs">TIME</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground font-mono text-sm">
                    Scanning intelligence feed...
                  </TableCell>
                </TableRow>
              ) : eventsList?.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground font-mono text-sm">
                    No events found matching criteria.
                  </TableCell>
                </TableRow>
              ) : (
                eventsList?.items.map((event) => (
                  <TableRow key={event.id} className="group hover:bg-muted/30 transition-colors">
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      <Link href={`/events/${event.id}`} className="hover:text-primary transition-colors">
                        #{event.id}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm">
                        <SourceIcon source={event.source} className="w-4 h-4 text-muted-foreground" />
                        <span className="capitalize">{event.source}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <Link href={`/events/${event.id}`} className="font-medium hover:underline decoration-primary underline-offset-4">
                          {event.title || `${event.source} ${event.event_type}`}
                        </Link>
                        <div className="text-xs text-muted-foreground font-mono mt-1">
                          {event.event_type} {event.service && `• ${event.service}`}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <SeverityBadge severity={event.severity} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={event.status} />
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground font-mono">
                      {formatRelative(event.created_at)}
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
