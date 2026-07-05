import { runBetaScenarios } from "../beta/scenarios";

async function main(): Promise<void> {
  const report = await runBetaScenarios();
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

