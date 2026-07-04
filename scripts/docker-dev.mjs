import { spawnSync } from "node:child_process";

const action = process.argv[2];

if (!["up", "down"].includes(action)) {
  console.error("Usage: node scripts/docker-dev.mjs <up|down>");
  process.exit(1);
}

const version = spawnSync("docker", ["compose", "version"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});

if (version.status !== 0) {
  console.error(
    `Docker Compose is required for pnpm db:dev:${action}. Install Docker Desktop or run PostgreSQL manually with DATABASE_URL.`,
  );
  if (version.error) console.error(version.error.message);
  process.exit(1);
}

const args =
  action === "up" ? ["compose", "up", "-d", "postgres"] : ["compose", "down"];
const result = spawnSync("docker", args, { stdio: "inherit" });

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
