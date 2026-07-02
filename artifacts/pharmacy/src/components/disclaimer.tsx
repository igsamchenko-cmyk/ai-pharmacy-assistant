import { DISCLAIMER_TEXT } from "@/lib/constants";
import { AlertTriangle } from "lucide-react";

export function GlobalDisclaimer() {
  return (
    <div
      className="bg-destructive/10 border-l-4 border-destructive text-destructive p-4 my-4 rounded-r-lg text-sm flex gap-3 items-start shadow-sm"
      data-testid="global-disclaimer"
    >
      <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
      <p className="leading-relaxed font-medium">{DISCLAIMER_TEXT}</p>
    </div>
  );
}
