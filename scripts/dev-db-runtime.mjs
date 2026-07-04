import { spawn, spawnSync } from "node:child_process";

const pnpmCli = process.env.npm_execpath;

if (!pnpmCli) {
  console.error(
    "pnpm execution path was not found. Run this script through pnpm.",
  );
  process.exit(1);
}

const env = {
  ...process.env,
  NODE_ENV: "development",
  KNOWLEDGE_DB_RUNTIME: "true",
  DATABASE_URL:
    process.env.DATABASE_URL ??
    "postgresql://farmassist:farmassist_dev_password@localhost:5432/farmassist",
  PORT: process.env.PORT ?? "5173",
};

console.log(
  "Starting API server with KNOWLEDGE_DB_RUNTIME=true. DATABASE_URL is configured but not printed.",
);

const build = spawnSync(
  process.execPath,
  [pnpmCli, "--filter", "@workspace/api-server", "run", "build"],
  { env, stdio: "inherit" },
);

if (build.status !== 0) process.exit(build.status ?? 1);

const child = spawn(
  process.execPath,
  [pnpmCli, "--filter", "@workspace/api-server", "run", "start"],
  { env, stdio: "inherit" },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
