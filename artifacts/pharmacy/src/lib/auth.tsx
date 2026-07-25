import {
  getGetAuthSessionQueryKey,
  useGetAuthSession,
  useLoginAuth,
  useRequestAuthChallenge,
  useLogoutAuth,
  type AuthLoginRequest,
  type AuthRole,
  type AuthSession,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, type ReactNode } from "react";

const ROLE_RANK: Record<AuthRole, number> = {
  none: 0,
  user: 1,
  reviewer: 2,
  admin: 3,
};

interface AuthContextValue {
  session: AuthSession | undefined;
  isLoading: boolean;
  isAuthenticated: boolean;
  isLocalBeta: boolean;
  hasRole(role: Exclude<AuthRole, "none">): boolean;
  requestLoginCode(email: string): Promise<void>;
  login(input: AuthLoginRequest): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const sessionQuery = useGetAuthSession({
    query: {
      queryKey: getGetAuthSessionQueryKey(),
      retry: false,
      staleTime: 30_000,
    },
  });
  const challengeMutation = useRequestAuthChallenge();
  const loginMutation = useLoginAuth({
    mutation: {
      onSuccess(data) {
        queryClient.setQueryData(getGetAuthSessionQueryKey(), data.session);
        queryClient.invalidateQueries();
      },
    },
  });
  const logoutMutation = useLogoutAuth({
    mutation: {
      onSuccess(data) {
        queryClient.setQueryData(getGetAuthSessionQueryKey(), data.session);
        queryClient.invalidateQueries();
      },
    },
  });

  const session = sessionQuery.data;
  const value: AuthContextValue = {
    session,
    isLoading: sessionQuery.isLoading,
    isAuthenticated: session?.authenticated === true,
    isLocalBeta: session?.mode === "local_beta" || session?.mode === "disabled",
    hasRole(role) {
      return ROLE_RANK[session?.role ?? "none"] >= ROLE_RANK[role];
    },
    async requestLoginCode(email) {
      await challengeMutation.mutateAsync({ data: { email } });
    },
    async login(input) {
      await loginMutation.mutateAsync({ data: input });
    },
    async logout() {
      await logoutMutation.mutateAsync();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}

export function roleLabel(role: AuthRole | undefined): string {
  if (role === "admin") return "Адмін";
  if (role === "reviewer") return "Рев'юер";
  if (role === "user") return "Користувач";
  return "Гість";
}
