import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ErrorBoundary } from "@/components/error-boundary";
import AccessDenied from "@/pages/access-denied";
import { Layout } from "@/components/layout";
import { AuthProvider } from "@/lib/auth";
import { CatalogClientIndexProvider } from "@/lib/catalog-client-index";
import { RegulatoryRadarRefreshProvider } from "@/lib/regulatory-radar-refresh";
import { ProtectedRoute } from "@/components/protected-route";

const LoginPage = lazy(() => import("@/pages/login"));
const Dispensing = lazy(() => import("@/pages/dispensing"));
const SearchPage = lazy(() => import("@/pages/search"));
const DrugDetail = lazy(() => import("@/pages/drug-detail"));
const Analogs = lazy(() => import("@/pages/analogs"));
const Interactions = lazy(() => import("@/pages/interactions"));
const Compare = lazy(() => import("@/pages/compare"));
const AiReference = lazy(() => import("@/pages/ai-reference"));
const History = lazy(() => import("@/pages/history"));
const Favorites = lazy(() => import("@/pages/favorites"));
const About = lazy(() => import("@/pages/about"));
const DataQuality = lazy(() => import("@/pages/data-quality"));
const ReviewQueue = lazy(() => import("@/pages/review"));
const BetaDashboard = lazy(() => import("@/pages/beta-dashboard"));
const RegulatoryRadar = lazy(() => import("@/pages/regulatory-radar"));
const DrugInstruction = lazy(() => import("@/pages/drug-instruction"));
const Pharmacovigilance = lazy(() => import("@/pages/pharmacovigilance"));
const RegistryProductDetail = lazy(
  () => import("@/pages/registry-product-detail"),
);
const NotFound = lazy(() => import("@/pages/not-found"));

const queryClient = new QueryClient();
const ProtectedDispensing = () => <ProtectedRoute component={Dispensing} />;
const ProtectedSearch = () => <ProtectedRoute component={SearchPage} />;
const ProtectedDrugDetail = () => <ProtectedRoute component={DrugDetail} />;
const ProtectedAnalogs = () => <ProtectedRoute component={Analogs} />;
const ProtectedInteractions = () => <ProtectedRoute component={Interactions} />;
const ProtectedCompare = () => <ProtectedRoute component={Compare} />;
const ProtectedAiReference = () => <ProtectedRoute component={AiReference} />;
const ProtectedHistory = () => <ProtectedRoute component={History} />;
const ProtectedFavorites = () => <ProtectedRoute component={Favorites} />;
const ProtectedDataQuality = () => (
  <ProtectedRoute component={DataQuality} minRole="reviewer" />
);
const ProtectedReviewQueue = () => (
  <ProtectedRoute component={ReviewQueue} minRole="reviewer" />
);
const ProtectedRegulatoryRadar = () => (
  <ProtectedRoute component={RegulatoryRadar} />
);
const ProtectedBetaDashboard = () => (
  <ProtectedRoute component={BetaDashboard} />
);
const ProtectedDrugInstruction = () => (
  <ProtectedRoute component={DrugInstruction} />
);
const ProtectedRegistryProductDetail = () => (
  <ProtectedRoute component={RegistryProductDetail} />
);
const ProtectedPharmacovigilance = () => (
  <ProtectedRoute component={Pharmacovigilance} />
);
const AccessDeniedRoute = () => <AccessDenied />;

function RouteLoadingFallback() {
  return (
    <div
      className="mx-auto flex min-h-40 w-full max-w-md items-center justify-center rounded-2xl border bg-card/70 p-6 text-sm text-muted-foreground"
      role="status"
      aria-live="polite"
      data-testid="route-loading"
    >
      Завантаження розділу…
    </div>
  );
}

function Router() {
  return (
    <Layout>
      <ErrorBoundary>
        <Suspense fallback={<RouteLoadingFallback />}>
          <Switch>
            <Route path="/" component={ProtectedDispensing} />
            <Route path="/login" component={LoginPage} />
            <Route path="/access-denied" component={AccessDeniedRoute} />
            <Route path="/dispense" component={ProtectedDispensing} />
            <Route
              path="/regulatory-radar"
              component={ProtectedRegulatoryRadar}
            />
            <Route path="/search" component={ProtectedSearch} />
            <Route
              path="/instructions/:productId"
              component={ProtectedDrugInstruction}
            />
            <Route
              path="/products/:productId"
              component={ProtectedRegistryProductDetail}
            />
            <Route
              path="/pharmacovigilance"
              component={ProtectedPharmacovigilance}
            />
            <Route path="/drug/:id" component={ProtectedDrugDetail} />
            <Route path="/analogs/:id" component={ProtectedAnalogs} />
            <Route path="/interactions" component={ProtectedInteractions} />
            <Route path="/compare" component={ProtectedCompare} />
            <Route path="/ai" component={ProtectedAiReference} />
            <Route path="/history" component={ProtectedHistory} />
            <Route path="/favorites" component={ProtectedFavorites} />
            <Route path="/data-quality" component={ProtectedDataQuality} />
            <Route path="/review" component={ProtectedReviewQueue} />
            <Route path="/beta-dashboard" component={ProtectedBetaDashboard} />
            <Route path="/about" component={About} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </ErrorBoundary>
    </Layout>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RegulatoryRadarRefreshProvider>
            <CatalogClientIndexProvider>
              <TooltipProvider>
                <WouterRouter
                  base={import.meta.env.BASE_URL.replace(/\/$/, "")}
                >
                  <Router />
                </WouterRouter>
                <Toaster />
              </TooltipProvider>
            </CatalogClientIndexProvider>
          </RegulatoryRadarRefreshProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
