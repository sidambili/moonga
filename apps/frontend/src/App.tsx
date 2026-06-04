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
import Sessions from "@/pages/agent-sessions";
import SessionDetail from "@/pages/agent-session-detail";
import ArtifactsReview from "@/pages/artifacts";
import ArtifactDetail from "@/pages/artifact-detail";
import Integrations from "@/pages/integrations";
import ModelSettings from "@/pages/settings";
import PlaybooksPage from "@/pages/playbooks";
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

function PublicRoute({ component: Component }: { component: React.ComponentType }) {
  const { data: session } = authClient.useSession();
  if (session) {
    return <Redirect to="/" />;
  }
  return (
    <ErrorBoundary>
      <Component />
    </ErrorBoundary>
  );
}

// Stable route wrappers to prevent remounts on every render
const DashboardRoute = () => <SafeRoute component={Dashboard} />;
const EventsFeedRoute = () => <SafeRoute component={EventsFeed} />;
const EventDetailRoute = () => <SafeRoute component={EventDetail} />;
const SessionsRoute = () => <SafeRoute component={Sessions} />;
const SessionDetailRoute = () => <SafeRoute component={SessionDetail} />;
const ArtifactsReviewRoute = () => <SafeRoute component={ArtifactsReview} />;
const ArtifactDetailRoute = () => <SafeRoute component={ArtifactDetail} />;
const IntegrationsRoute = () => <SafeRoute component={Integrations} />;
const ModelSettingsRoute = () => <SafeRoute component={ModelSettings} />;
const PlaybooksRoute = () => <SafeRoute component={PlaybooksPage} />;
const LoginRoute = () => <PublicRoute component={Login} />;
const SignupRoute = () => <PublicRoute component={Signup} />;

function AuthenticatedApp() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={DashboardRoute} />
        <Route path="/events" component={EventsFeedRoute} />
        <Route path="/events/:id" component={EventDetailRoute} />
        <Route path="/agent-sessions" component={SessionsRoute} />
        <Route path="/agent-sessions/:id" component={SessionDetailRoute} />
        <Route path="/artifacts" component={ArtifactsReviewRoute} />
        <Route path="/artifacts/:id" component={ArtifactDetailRoute} />
        <Route path="/integrations" component={IntegrationsRoute} />
        <Route path="/playbooks" component={PlaybooksRoute} />
        <Route path="/settings" component={ModelSettingsRoute} />
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
      <Route path="/login" component={LoginRoute} />
      <Route path="/signup" component={SignupRoute} />
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
