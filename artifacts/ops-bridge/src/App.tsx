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
