import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ErrorBoundary } from "@/components/error-boundary";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";
import { AuthProvider } from "@/lib/auth";
import { ProtectedRoute } from "@/components/protected-route";

import Home from "@/pages/home";
import LoginPage from "@/pages/login";
import AccessDenied from "@/pages/access-denied";
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
import DataQuality from "@/pages/data-quality";
import ReviewQueue from "@/pages/review";
import BetaDashboard from "@/pages/beta-dashboard";
import DrugInstruction from "@/pages/drug-instruction";
import RegistryProductDetail from "@/pages/registry-product-detail";

const queryClient = new QueryClient();
const ProtectedSearch = () => <ProtectedRoute component={SearchPage} />;
const ProtectedDrugDetail = () => <ProtectedRoute component={DrugDetail} />;
const ProtectedAnalogs = () => <ProtectedRoute component={Analogs} />;
const ProtectedInteractions = () => <ProtectedRoute component={Interactions} />;
const ProtectedCompare = () => <ProtectedRoute component={Compare} />;
const ProtectedHospital = () => <ProtectedRoute component={Hospital} />;
const ProtectedAiReference = () => <ProtectedRoute component={AiReference} />;
const ProtectedScan = () => <ProtectedRoute component={Scan} />;
const ProtectedHistory = () => <ProtectedRoute component={History} />;
const ProtectedDataQuality = () => (
  <ProtectedRoute component={DataQuality} minRole="reviewer" />
);
const ProtectedReviewQueue = () => (
  <ProtectedRoute component={ReviewQueue} minRole="reviewer" />
);
const ProtectedBetaDashboard = () => <ProtectedRoute component={BetaDashboard} />;
const ProtectedDrugInstruction = () => <ProtectedRoute component={DrugInstruction} />;
const ProtectedRegistryProductDetail = () => <ProtectedRoute component={RegistryProductDetail} />;
const AccessDeniedRoute = () => <AccessDenied />;

function Router() {
  return (
    <Layout>
      <ErrorBoundary>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/login" component={LoginPage} />
          <Route path="/access-denied" component={AccessDeniedRoute} />
          <Route path="/search" component={ProtectedSearch} />
          <Route path="/instructions/:productId" component={ProtectedDrugInstruction} />
          <Route path="/products/:productId" component={ProtectedRegistryProductDetail} />
          <Route path="/drug/:id" component={ProtectedDrugDetail} />
          <Route path="/analogs/:id" component={ProtectedAnalogs} />
          <Route path="/interactions" component={ProtectedInteractions} />
          <Route path="/compare" component={ProtectedCompare} />
          <Route path="/hospital" component={ProtectedHospital} />
          <Route path="/ai" component={ProtectedAiReference} />
          <Route path="/scan" component={ProtectedScan} />
          <Route path="/history" component={ProtectedHistory} />
          <Route path="/data-quality" component={ProtectedDataQuality} />
          <Route path="/review" component={ProtectedReviewQueue} />
          <Route path="/beta-dashboard" component={ProtectedBetaDashboard} />
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
        <AuthProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
