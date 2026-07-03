import { verifyKnowledgeRuntime } from "../knowledge/runtimeVerify";

function hasArg(name: string): boolean {
  return process.argv.includes(name);
}

async function main(): Promise<void> {
  const report = await verifyKnowledgeRuntime({
    strict: hasArg("--strict"),
    sample: process.argv.find((arg) => arg.startsWith("--sample="))?.slice(9),
  });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
