import { Link, useLocation } from "wouter";
import { LayoutDashboard, Radio, Cpu, FileCheck2, Webhook, Settings, TerminalSquare } from "lucide-react";
import { cn } from "@/lib/format";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const nav = [
    { label: "Dashboard", href: "/", icon: LayoutDashboard },
    { label: "Events Feed", href: "/events", icon: Radio },
    { label: "Agent Sessions", href: "/sessions", icon: Cpu },
    { label: "Review Queue", href: "/artifacts", icon: FileCheck2 },
    { label: "Integrations", href: "/integrations", icon: Webhook },
    { label: "Model Settings", href: "/settings", icon: Settings },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-sidebar flex-shrink-0 flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <TerminalSquare className="w-6 h-6 mr-3 text-primary" />
          <span className="font-bold text-lg tracking-tight font-mono">OPS_BRIDGE</span>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {nav.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} className={cn(
                "flex items-center px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                isActive 
                  ? "bg-primary/10 text-primary border border-primary/20" 
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground border border-transparent"
              )}>
                <item.icon className={cn("w-4 h-4 mr-3", isActive ? "text-primary" : "text-muted-foreground")} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        
        <div className="p-4 border-t border-border text-xs text-muted-foreground font-mono">
          <div>SYS.VER: 0.1.0-alpha</div>
          <div>NET.STATUS: NOMINAL</div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
