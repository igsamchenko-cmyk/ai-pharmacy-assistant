import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, WifiOff } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  isOfflineChunkFailure: boolean;
}

export function isLazyChunkLoadError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : typeof error === "string"
        ? error
        : "";
  return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/iu.test(
    message,
  );
}

/**
 * Catches render-time errors anywhere below it so a single broken page never
 * takes down the whole app. Shows a Ukrainian recovery message.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, isOfflineChunkFailure: false };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      isOfflineChunkFailure:
        isLazyChunkLoadError(error) &&
        typeof navigator !== "undefined" &&
        navigator.onLine === false,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("UI error boundary caught an error", error, info);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, isOfflineChunkFailure: false });
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    const offlineChunk = this.state.isOfflineChunkFailure;
    const Icon = offlineChunk ? WifiOff : AlertTriangle;

    return (
      <div className="flex flex-col items-center justify-center gap-4 px-4 py-20 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <Icon className="h-8 w-8" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-foreground">
            {offlineChunk
              ? "Службовий розділ недоступний офлайн"
              : "Щось пішло не так"}
          </h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            {offlineChunk
              ? "Цей розділ не зберігається на пристрої. Підключіться до інтернету й повторіть спробу. Пошук і збережені картки залишаються доступними."
              : "Сталася неочікувана помилка інтерфейсу. Спробуйте оновити сторінку."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={this.handleReset} variant="outline">
            Спробувати ще раз
          </Button>
          <Button onClick={() => window.location.reload()}>
            Оновити сторінку
          </Button>
        </div>
      </div>
    );
  }
}
