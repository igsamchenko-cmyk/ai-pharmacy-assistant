import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

const databaseUrl = process.env.DATABASE_URL;
const databaseSsl = process.env.DATABASE_SSL === "true";

function dbCredentials() {
  if (!databaseSsl) return { url: databaseUrl };

  const parsed = new URL(databaseUrl);
  return {
    host: parsed.hostname,
    ...(parsed.port ? { port: Number(parsed.port) } : {}),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
    ssl: true,
  };
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: dbCredentials(),
});
