import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  fileURLToPath(
    new URL(
      "../../../../../.github/workflows/render-production-deploy.yml",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("Render Neon database configuration workflow", () => {
  const job = workflow.slice(
    workflow.indexOf("  configure_database:"),
    workflow.indexOf("  enable_auto_deploy:"),
  );

  it("is an explicit protected production operation", () => {
    expect(workflow).toContain("- configure-database");
    expect(job).toContain("inputs.operation == 'configure-database'");
    expect(job).toContain("name: production");
    expect(job).toContain(
      "PRODUCTION_DATABASE_URL: ${{ secrets.PRODUCTION_DATABASE_URL }}",
    );
  });

  it("accepts only Neon hosts and configures the DB runtime flags", () => {
    expect(job).toContain('host.endsWith(".neon.tech")');
    expect(job).toContain(
      "keys=(DATABASE_URL DATABASE_SSL KNOWLEDGE_DB_RUNTIME)",
    );
    expect(job).toContain('values=("$PRODUCTION_DATABASE_URL" "true" "true")');
  });

  it("does not print or persist the connection value as an artifact", () => {
    expect(job).not.toMatch(/echo[^\n]*PRODUCTION_DATABASE_URL/u);
    expect(job).not.toContain("actions/upload-artifact");
    expect(job).toContain("No environment values were printed.");
  });
});
