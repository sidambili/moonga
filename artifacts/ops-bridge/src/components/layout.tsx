import { useState } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Radio, Cpu, FileCheck2, Webhook, Settings, TerminalSquare, Menu, X } from "lucide-react";
import { cn } from "@/lib/format";

const nav = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Events Feed", href: "/events", icon: Radio },
  { label: "Agent Sessions", href: "/sessions", icon: Cpu },
  { label: "Review Queue", href: "/artifacts", icon: FileCheck2 },
  { label: "Integrations", href: "/integrations", icon: Webhook },
  { label: "Model Settings", href: "/settings", icon: Settings },
];

const bottomNav = nav.slice(0, 5);

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ── Desktop Sidebar ── */}
      <aside className="hidden md:flex w-64 border-r border-border bg-sidebar flex-shrink-0 flex-col">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <TerminalSquare className="w-6 h-6 mr-3 text-primary" />
          <span className="font-bold text-lg tracking-tight font-mono">OPS_BRIDGE</span>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                isActive(item.href)
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground border border-transparent"
              )}
            >
              <item.icon className={cn("w-4 h-4 mr-3", isActive(item.href) ? "text-primary" : "text-muted-foreground")} />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-border text-xs text-muted-foreground font-mono">
          <div>SYS.VER: 0.1.0-alpha</div>
          <div>NET.STATUS: NOMINAL</div>
        </div>
      </aside>

      {/* ── Mobile Slide-over Drawer ── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-sidebar border-r border-border flex flex-col">
            <div className="h-16 flex items-center justify-between px-6 border-b border-border">
              <div className="flex items-center">
                <TerminalSquare className="w-5 h-5 mr-3 text-primary" />
                <span className="font-bold text-base tracking-tight font-mono">OPS_BRIDGE</span>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center px-3 py-3 rounded-md text-sm font-medium transition-colors",
                    isActive(item.href)
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground border border-transparent"
                  )}
                >
                  <item.icon className={cn("w-4 h-4 mr-3", isActive(item.href) ? "text-primary" : "text-muted-foreground")} />
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="p-4 border-t border-border text-xs text-muted-foreground font-mono">
              <div>SYS.VER: 0.1.0-alpha</div>
              <div>NET.STATUS: NOMINAL</div>
            </div>
          </aside>
        </div>
      )}

      {/* ── Main content ── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between h-14 px-4 border-b border-border bg-sidebar flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center">
            <TerminalSquare className="w-4 h-4 mr-2 text-primary" />
            <span className="font-bold text-sm tracking-tight font-mono">OPS_BRIDGE</span>
          </div>
          <div className="w-8" />
        </header>

        {/* Scrollable page content */}
        <div className="flex-1 overflow-y-auto pb-16 md:pb-0">
          {children}
        </div>

        {/* ── Mobile bottom tab bar ── */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-stretch border-t border-border bg-sidebar">
          {bottomNav.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-mono font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <item.icon className={cn("w-5 h-5", active ? "text-primary" : "text-muted-foreground")} />
                <span className="leading-none truncate max-w-[56px] text-center">
                  {item.label.split(" ")[0]}
                </span>
              </Link>
            );
          })}
        </nav>
      </main>
    </div>
  );
}
