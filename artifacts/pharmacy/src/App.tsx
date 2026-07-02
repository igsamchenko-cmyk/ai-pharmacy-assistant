import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ErrorBoundary } from "@/components/error-boundary";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";

import Home from "@/pages/home";
import SearchPage from "@/pages/search";
import DrugDetail from "@/pages/drug-detail";
import Analogs from "@/pages/analogs";
import Interactions from "@/pages/interactions";
import Compare from "@/pages/compare";
import Hospital from "@/pages/hospital";
import AiReference from "@/pages/ai-reference";
import Scan from "@/pages/scan";
import History from "@/pages/history";
import About from "@/pages/about";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <ErrorBoundary>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/search" component={SearchPage} />
          <Route path="/drug/:id" component={DrugDetail} />
          <Route path="/analogs/:id" component={Analogs} />
          <Route path="/interactions" component={Interactions} />
          <Route path="/compare" component={Compare} />
          <Route path="/hospital" component={Hospital} />
          <Route path="/ai" component={AiReference} />
          <Route path="/scan" component={Scan} />
          <Route path="/history" component={History} />
          <Route path="/about" component={About} />
          <Route component={NotFound} />
        </Switch>
      </ErrorBoundary>
    </Layout>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
