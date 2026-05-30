import { useGetDashboardSummary, useGetRecentActivity, useGetSeverityBreakdown, useGetSourceBreakdown, useHealthCheck } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Activity, LayoutGrid, CheckCircle2, Clock, ShieldAlert } from "lucide-react";

export default function Dashboard() {
  const { data: summary, isLoading: isSummaryLoading } = useGetDashboardSummary({ query: { refetchInterval: 30000 } });
  const { data: recent } = useGetRecentActivity({ query: { refetchInterval: 30000 } });
  const { data: severity } = useGetSeverityBreakdown({ query: { refetchInterval: 30000 } });
  const { data: source } = useGetSourceBreakdown({ query: { refetchInterval: 30000 } });
  const { data: health } = useHealthCheck({ query: { refetchInterval: 60000 } });

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4 md:space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Command Center</h1>
          <p className="text-muted-foreground text-xs font-mono mt-1">
            OPS_BRIDGE // OVERVIEW // {new Date().toISOString().split("T")[0]}
          </p>
        </div>
        <Badge
          variant="outline"
          className={`font-mono text-xs flex-shrink-0 mt-1 ${health?.status === "ok" ? "text-green-500 border-green-500/30" : "text-destructive border-destructive/30"}`}
        >
          {health?.status === "ok" ? (
            <><CheckCircle2 className="w-3 h-3 mr-1" /> SYS OK</>
          ) : (
            <><AlertCircle className="w-3 h-3 mr-1" /> DEGRADED</>
          )}
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <Card className="bg-card/50 backdrop-blur">
          <CardHeader className="pb-1 pt-3 px-3 md:pb-2 md:pt-4 md:px-4">
            <CardTitle className="text-[10px] md:text-xs font-medium text-muted-foreground flex items-center gap-1.5 uppercase">
              <Activity className="w-3.5 h-3.5" /> Total Events
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 md:px-4 md:pb-4">
            <div className="text-2xl md:text-3xl font-bold font-mono">
              {isSummaryLoading ? "-" : summary?.total_events ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur border-destructive/20">
          <CardHeader className="pb-1 pt-3 px-3 md:pb-2 md:pt-4 md:px-4">
            <CardTitle className="text-[10px] md:text-xs font-medium text-destructive flex items-center gap-1.5 uppercase">
              <ShieldAlert className="w-3.5 h-3.5" /> Critical
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 md:px-4 md:pb-4">
            <div className="text-2xl md:text-3xl font-bold font-mono text-destructive">
              {isSummaryLoading ? "-" : summary?.critical_open ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur">
          <CardHeader className="pb-1 pt-3 px-3 md:pb-2 md:pt-4 md:px-4">
            <CardTitle className="text-[10px] md:text-xs font-medium text-orange-500 flex items-center gap-1.5 uppercase">
              <Clock className="w-3.5 h-3.5" /> Pending
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 md:px-4 md:pb-4">
            <div className="text-2xl md:text-3xl font-bold font-mono text-orange-500">
              {isSummaryLoading ? "-" : summary?.pending_review ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur">
          <CardHeader className="pb-1 pt-3 px-3 md:pb-2 md:pt-4 md:px-4">
            <CardTitle className="text-[10px] md:text-xs font-medium text-blue-500 flex items-center gap-1.5 uppercase">
              <LayoutGrid className="w-3.5 h-3.5" /> Sessions
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 md:px-4 md:pb-4">
            <div className="text-2xl md:text-3xl font-bold font-mono text-blue-500">
              {isSummaryLoading ? "-" : summary?.sessions_running ?? 0}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
