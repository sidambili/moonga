import { useState } from "react";
import { useGetDashboardSummary, useGetRecentActivity, useGetSeverityBreakdown, useGetSourceBreakdown, useHealthCheck } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Activity, LayoutGrid, CheckCircle2, Clock, ShieldAlert } from "lucide-react";

export default function Dashboard() {
  const { data: summary, isLoading: isSummaryLoading } = useGetDashboardSummary({ query: { refetchInterval: 30000 } });
  const { data: recent, isLoading: isRecentLoading } = useGetRecentActivity({ query: { refetchInterval: 30000 } });
  const { data: severity, isLoading: isSeverityLoading } = useGetSeverityBreakdown({ query: { refetchInterval: 30000 } });
  const { data: source, isLoading: isSourceLoading } = useGetSourceBreakdown({ query: { refetchInterval: 30000 } });
  const { data: health } = useHealthCheck({ query: { refetchInterval: 60000 } });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Command Center</h1>
          <p className="text-muted-foreground text-sm font-mono mt-1">
            OPS_BRIDGE // OVERVIEW // {new Date().toISOString().split("T")[0]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`font-mono text-xs ${health?.status === "ok" ? "text-green-500 border-green-500/30" : "text-destructive border-destructive/30"}`}>
            {health?.status === "ok" ? (
              <><CheckCircle2 className="w-3 h-3 mr-1" /> SYSTEM OK</>
            ) : (
              <><AlertCircle className="w-3 h-3 mr-1" /> DEGRADED</>
            )}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="bg-card/50 backdrop-blur">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2 uppercase">
              <Activity className="w-4 h-4" /> Total Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">
              {isSummaryLoading ? "-" : summary?.total_events ?? 0}
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-card/50 backdrop-blur border-destructive/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-destructive flex items-center gap-2 uppercase">
              <ShieldAlert className="w-4 h-4" /> Critical Open
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono text-destructive">
              {isSummaryLoading ? "-" : summary?.critical_open ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-orange-500 flex items-center gap-2 uppercase">
              <Clock className="w-4 h-4" /> Pending Review
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono text-orange-500">
              {isSummaryLoading ? "-" : summary?.pending_review ?? 0}
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-card/50 backdrop-blur">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-blue-500 flex items-center gap-2 uppercase">
              <LayoutGrid className="w-4 h-4" /> Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono text-blue-500">
              {isSummaryLoading ? "-" : summary?.sessions_running ?? 0}
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Rest of the dashboard... */}
    </div>
  );
}
