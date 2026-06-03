import { useState } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Radio, Cpu, FileCheck2, Webhook, Settings, X, Menu, Zap, LogOut, Bell, Search, RefreshCw, BookOpen } from "lucide-react";
import { cn } from "@/lib/format";
import { ModeToggle } from "@/components/mode-toggle";
import { OrgSwitcher } from "@/components/org-switcher";
import { ProjectSwitcher } from "@/components/project-switcher";
import { authClient } from "@/lib/auth-client";

const nav = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Events", href: "/events", icon: Radio },
  { label: "Sessions", href: "/sessions", icon: Cpu },
  { label: "Review", href: "/artifacts", icon: FileCheck2 },
  { label: "Integrations", href: "/integrations", icon: Webhook },
  { label: "Playbooks", href: "/playbooks", icon: BookOpen },
  { label: "Settings", href: "/settings", icon: Settings },
];

const bottomNav = nav.slice(0, 5);

async function signOut() {
  try {
    await authClient.signOut();
  } catch (err) {
    console.error("Sign out failed:", err);
  }
  window.location.href = "/login";
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  return (
    <div className="flex h-screen overflow-hidden bg-background">

      {/* ── Desktop Sidebar ── */}
      <aside className="hidden md:flex w-60 flex-shrink-0 flex-col border-r border-border/60">
        <div className="h-14 flex items-center justify-between px-5 border-b border-border/40">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="font-semibold text-sm tracking-tight">Oncident</span>
          </div>
          <ModeToggle />
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
          {nav.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-border/40">
          <div className="flex items-center gap-2 px-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
            <span className="text-xs text-muted-foreground flex-1">System nominal</span>
            <button
              onClick={signOut}
              title="Sign out"
              className="w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Mobile Drawer ── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-background border-r border-border flex flex-col">
            <div className="h-14 flex items-center justify-between px-5 border-b border-border/40">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5 text-primary" />
                </div>
                <span className="font-semibold text-sm tracking-tight">Oncident</span>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
              {nav.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setDrawerOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all active:scale-[0.98]",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    )}
                  >
                    <item.icon className="w-4 h-4 flex-shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="p-3 border-t border-border/40">
              <div className="flex items-center gap-2 px-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                <span className="text-xs text-muted-foreground flex-1">System nominal</span>
                <button
                  onClick={signOut}
                  title="Sign out"
                  className="w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* ── Main Content ── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Subtle ambient background */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03] dark:opacity-[0.05]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, hsl(var(--muted-foreground)) 1px, transparent 0)`,
            backgroundSize: '32px 32px',
          }}
        />

        {/* Top bar — unified across all breakpoints */}
        <header className="flex items-center justify-between h-14 px-4 border-b border-border/40 flex-shrink-0">
          {/* Left: hamburger (mobile) + page title */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setDrawerOpen(true)}
              className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Menu className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold tracking-tight">
              {nav.find((item) => isActive(item.href))?.label ?? "Oncident"}
            </span>
            <div className="w-px h-4 bg-border mx-1" />
            <OrgSwitcher />
            <span className="text-muted-foreground/40 text-sm">/</span>
            <ProjectSwitcher />
          </div>

          {/* Right: action slots */}
          <div className="flex items-center gap-1">
            <button
              disabled
              title="Search — coming soon"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground/40 cursor-not-allowed"
            >
              <Search className="w-4 h-4" />
            </button>
            <button
              disabled
              title="Notifications — coming soon"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground/40 cursor-not-allowed"
            >
              <Bell className="w-4 h-4" />
            </button>
            <button
              disabled
              title="Refresh — coming soon"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground/40 cursor-not-allowed"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-border mx-1" />
            <ModeToggle />
          </div>
        </header>

        {/* Scrollable content, padded above bottom nav on mobile */}
        <div className="flex-1 overflow-y-auto pb-20 md:pb-0">
          {children}
        </div>

        {/* ── Mobile Bottom Tab Bar ── */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-end border-t border-border/40 bg-background/95 backdrop-blur-md pb-safe">
          {bottomNav.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex-1 flex flex-col items-center gap-1 pt-2 pb-5 transition-colors active:opacity-60"
              >
                <div
                  className={cn(
                    "flex items-center justify-center w-11 h-11 rounded-2xl transition-all active:scale-90",
                    active ? "bg-primary/10" : "bg-transparent"
                  )}
                >
                  <item.icon
                    className={cn("w-5 h-5", active ? "text-primary" : "text-muted-foreground")}
                  />
                </div>
                <span
                  className={cn(
                    "text-[10px] font-medium leading-none",
                    active ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </main>
    </div>
  );
}
