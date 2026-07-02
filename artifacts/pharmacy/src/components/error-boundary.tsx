import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Catches render-time errors anywhere below it so a single broken page never
 * takes down the whole app. Shows a Ukrainian recovery message.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("UI error boundary caught an error", error, info);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 px-4 text-center">
        <div className="w-16 h-16 bg-destructive/10 text-destructive rounded-full flex items-center justify-center">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-foreground">
            Щось пішло не так
          </h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            Сталася неочікувана помилка інтерфейсу. Спробуйте оновити сторінку.
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
