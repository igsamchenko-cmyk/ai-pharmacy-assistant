import {
  runKnowledgeRuntimeSmoke,
  RuntimeSmokeConfigurationError,
} from "../knowledge/runtimeSmoke";

async function main(): Promise<void> {
  const sample = process.argv
    .find((arg) => arg.startsWith("--sample="))
    ?.slice(9);
  const report = await runKnowledgeRuntimeSmoke({ sample });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((error) => {
  if (error instanceof RuntimeSmokeConfigurationError) {
    console.error(error.message);
  } else {
    console.error(error instanceof Error ? error.message : String(error));
  }
  process.exit(1);
});
