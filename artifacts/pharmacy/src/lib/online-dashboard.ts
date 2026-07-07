import type {
  AuthRole,
  BetaDashboardStatus,
  DataSourcesResponse,
} from "@workspace/api-client-react";

export type OnlineRouteId =
  | "home"
  | "search"
  | "interactions"
  | "compare"
  | "hospital"
  | "beta-dashboard"
  | "data-quality"
  | "review"
  | "about";

export type DashboardCard = {
  id: OnlineRouteId;
  href: string;
  title: string;
  description: string;
  minRole?: Exclude<AuthRole, "none">;
  prominent?: boolean;
};

export type QuickExample = {
  label: string;
  href: string;
  kind: "search" | "interaction" | "compare";
};

export type RuntimeSummary = {
  runtimeMode: "static fallback" | "DB runtime" | "unknown";
  postgresqlConfigured: boolean | null;
  geminiConfigured: boolean | null;
  openAiEnabled: boolean | null;
  authMode: string;
  currentRole: AuthRole;
  dbWarning: string | null;
  geminiWarning: string | null;
};

export const DASHBOARD_CARDS: DashboardCard[] = [
  {
    id: "search",
    href: "/search",
    title: "Пошук препарату",
    description: "Знайти препарат за назвою, МНН, ATC або дозуванням.",
  },
  {
    id: "interactions",
    href: "/interactions",
    title: "Перевірка взаємодій",
    description: "Перевірити довідкові правила сумісності препаратів.",
  },
  {
    id: "compare",
    href: "/compare",
    title: "Порівняння препаратів",
    description: "Порівняти склад, форму, показання та взаємодії поруч.",
  },
  {
    id: "beta-dashboard",
    href: "/beta-dashboard",
    title: "Beta Dashboard / Панель тестування",
    description: "Запустити readiness, сценарії, якість пошуку та safety checks.",
    prominent: true,
  },
  {
    id: "data-quality",
    href: "/data-quality",
    title: "Якість даних",
    description: "Перевірити runtime, backfill, coverage та diagnostics.",
    minRole: "reviewer",
  },
  {
    id: "review",
    href: "/review",
    title: "Черга рев’ю",
    description: "Рев’ю імпортованих назв після підключення PostgreSQL.",
    minRole: "reviewer",
  },
  {
    id: "hospital",
    href: "/hospital",
    title: "Hospital quick mode",
    description: "Швидкий режим пошуку біля пацієнта.",
  },
];

export const SEARCH_EXAMPLES: QuickExample[] = [
  "Нурофен",
  "Парацетамол",
  "Ібупрофен",
  "Амоксиклав",
  "Варфарин",
  "Цефтріаксон",
  "Лозартан",
].map((label) => ({
  label,
  href: `/search?q=${encodeURIComponent(label)}`,
  kind: "search" as const,
}));

export const INTERACTION_EXAMPLES: QuickExample[] = [
  {
    label: "Варфарин + Ібупрофен",
    href: `/interactions?example=${encodeURIComponent("Варфарин+Ібупрофен")}`,
    kind: "interaction",
  },
  {
    label: "Лоратадин + Аскорбінова кислота",
    href: `/interactions?example=${encodeURIComponent("Лоратадин+Аскорбінова кислота")}`,
    kind: "interaction",
  },
];

export const COMPARE_EXAMPLES: QuickExample[] = [
  {
    label: "Ібупрофен vs Парацетамол",
    href: `/compare?example=${encodeURIComponent("Ібупрофен vs Парацетамол")}`,
    kind: "compare",
  },
];

export const DB_ABSENT_WARNING =
  "PostgreSQL не підключено. Працює static fallback mode. База рев’ю та DB runtime обмежені.";

export const GEMINI_ABSENT_WARNING =
  "Gemini API не підключено. AI/OCR можуть працювати в fallback/demo режимі.";

const ROLE_RANK: Record<AuthRole, number> = {
  none: 0,
  user: 1,
  reviewer: 2,
  admin: 3,
};

export function roleCanSee(
  currentRole: AuthRole | undefined,
  minRole: Exclude<AuthRole, "none"> | undefined,
): boolean {
  if (!minRole) return true;
  return ROLE_RANK[currentRole ?? "none"] >= ROLE_RANK[minRole];
}

export function visibleDashboardCards(role: AuthRole | undefined): DashboardCard[] {
  return DASHBOARD_CARDS.filter((card) => roleCanSee(role, card.minRole));
}

export function buildRuntimeSummary(input: {
  status?: BetaDashboardStatus;
  sources?: DataSourcesResponse;
  role?: AuthRole;
  isLocalBeta?: boolean;
}): RuntimeSummary {
  const runtime = input.status?.runtime;
  const sourceById = new Map(
    (input.sources?.sources ?? []).map((source) => [source.id, source]),
  );
  const gemini = sourceById.get("gemini");
  const openAi = sourceById.get("openai");
  const postgresqlConfigured = runtime ? runtime.dbConfigured : null;
  const geminiConfigured = gemini ? gemini.status === "active" : null;
  const openAiEnabled = openAi ? openAi.status !== "disabled" : null;

  return {
    runtimeMode: runtime
      ? runtime.mode === "db"
        ? "DB runtime"
        : "static fallback"
      : "unknown",
    postgresqlConfigured,
    geminiConfigured,
    openAiEnabled,
    authMode: input.isLocalBeta ? "local private beta" : "configured auth",
    currentRole: input.role ?? "none",
    dbWarning: postgresqlConfigured === false ? DB_ABSENT_WARNING : null,
    geminiWarning: geminiConfigured === false ? GEMINI_ABSENT_WARNING : null,
  };
}

export const ONLINE_NAV_ITEMS: Array<{
  id: OnlineRouteId;
  href: string;
  label: string;
  minRole?: Exclude<AuthRole, "none">;
}> = [
  { id: "home", href: "/", label: "Головна" },
  { id: "search", href: "/search", label: "Пошук" },
  { id: "interactions", href: "/interactions", label: "Взаємодії" },
  { id: "compare", href: "/compare", label: "Порівняння" },
  { id: "hospital", href: "/hospital", label: "Hospital mode" },
  { id: "beta-dashboard", href: "/beta-dashboard", label: "Beta Dashboard" },
  { id: "data-quality", href: "/data-quality", label: "Data Quality", minRole: "reviewer" },
  { id: "review", href: "/review", label: "Review Queue", minRole: "reviewer" },
  { id: "about", href: "/about", label: "Diagnostics/About", minRole: "admin" },
];

export function visibleNavItems(role: AuthRole | undefined) {
  return ONLINE_NAV_ITEMS.filter((item) => roleCanSee(role, item.minRole));
}

export function containsSecretMarkers(value: string): boolean {
  return /(DATABASE_URL|API_KEY|SECRET|TOKEN|postgresql:\/\/|sk-|AIza)/i.test(value);
}
