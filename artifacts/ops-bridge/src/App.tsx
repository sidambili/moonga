import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { Layout } from "@/components/layout";
import { ErrorBoundary } from "@/components/error-boundary";
import { authClient } from "@/lib/auth-client";
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
import Login from "@/pages/login";
import Signup from "@/pages/signup";

const queryClient = new QueryClient();

function SafeRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <ErrorBoundary>
      <Component />
    </ErrorBoundary>
  );
}

function AuthenticatedApp() {
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

function Router() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-sm text-muted-foreground animate-pulse">Loading…</div>
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/login" component={() => <SafeRoute component={Login} />} />
      <Route path="/signup" component={() => <SafeRoute component={Signup} />} />
      <Route>
        {session ? <AuthenticatedApp /> : <Redirect to="/login" />}
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
