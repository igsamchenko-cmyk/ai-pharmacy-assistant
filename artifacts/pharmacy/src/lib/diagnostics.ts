import { getDiagnostics } from "@workspace/api-client-react";
import type { DiagnosticsPanelData } from "@workspace/api-client-react";

export type { DiagnosticsPanelData };

export async function fetchDiagnostics(): Promise<DiagnosticsPanelData> {
  return getDiagnostics();
}
