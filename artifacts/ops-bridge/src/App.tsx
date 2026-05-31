import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { Layout } from "@/components/layout";
import { ErrorBoundary } from "@/components/error-boundary";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import EventsFeed from "@/pages/events";
import EventDetail from "@/pages/event-detail";
import Sessions from "@/pages/sessions";
import SessionDetail from "@/pages/session-detail";
import ArtifactsReview from "@/pages/artifacts";
import ArtifactDetail from "@/pages/artifact-detail";
import Integrations from "@/pages/integrations";
import ModelSettings from "@/pages/settings";
import { useAuth } from "@workspace/replit-auth-web";

const queryClient = new QueryClient();

function SafeRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <ErrorBoundary>
      <Component />
    </ErrorBoundary>
  );
}

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={() => <SafeRoute component={Dashboard} />} />
        <Route path="/events" component={() => <SafeRoute component={EventsFeed} />} />
        <Route path="/events/:id" component={() => <SafeRoute component={EventDetail} />} />
        <Route path="/sessions" component={() => <SafeRoute component={Sessions} />} />
        <Route path="/sessions/:id" component={() => <SafeRoute component={SessionDetail} />} />
        <Route path="/artifacts" component={() => <SafeRoute component={ArtifactsReview} />} />
        <Route path="/artifacts/:id" component={() => <SafeRoute component={ArtifactDetail} />} />
        <Route path="/integrations" component={() => <SafeRoute component={Integrations} />} />
        <Route path="/settings" component={() => <SafeRoute component={ModelSettings} />} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated, login } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-6 bg-background">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center mb-1">
            <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Oncident</h1>
          <p className="text-sm text-muted-foreground">Log in to access your operations bridge</p>
        </div>
        <button
          onClick={login}
          className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Log in
        </button>
      </div>
    );
  }

  return <>{children}</>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AuthGate>
              <Router />
            </AuthGate>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
