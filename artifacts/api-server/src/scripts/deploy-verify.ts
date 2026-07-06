import { runDeployVerify } from "../deploy/verify";

function argValue(prefix: string): string | null {
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function deploymentUrl(): string | null {
  return (
    argValue("--url=") ??
    process.env.DEPLOYMENT_URL ??
    process.env.RENDER_EXTERNAL_URL ??
    null
  );
}

function secretProbeValues(): string[] {
  return [
    process.env.DATABASE_URL,
    process.env.GEMINI_API_KEY,
    process.env.OPENAI_API_KEY,
    process.env.SUPABASE_ANON_KEY,
    process.env.DEPLOY_VERIFY_COOKIE,
  ].filter((value): value is string => Boolean(value));
}

async function main(): Promise<void> {
  const baseUrl = deploymentUrl();
  if (!baseUrl) {
    console.error(
      "Deployment URL is required. Set DEPLOYMENT_URL or pass --url=https://your-service.example.",
    );
    process.exit(1);
  }

  const report = await runDeployVerify({
    baseUrl,
    email: argValue("--email=") ?? process.env.DEPLOY_VERIFY_EMAIL ?? null,
    secretProbeValues: secretProbeValues(),
  });

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
