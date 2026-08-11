import app from "./app";
import { logger } from "./lib/logger";
import { warmCatalogClientIndexCache } from "./services/catalogClientIndexService";
import { warmInstructionSearchIndex } from "./services/instructionSearchService";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const instructionPrewarmStartedAt = Date.now();
try {
  warmInstructionSearchIndex();
  logger.info(
    { durationMs: Date.now() - instructionPrewarmStartedAt },
    "Instruction search index prewarmed",
  );
} catch (error) {
  logger.warn({ err: error }, "Instruction search index prewarm unavailable");
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  const prewarmStartedAt = Date.now();
  void warmCatalogClientIndexCache()
    .then(({ productCount, snapshotHash, wireBytes }) => {
      logger.info(
        {
          durationMs: Date.now() - prewarmStartedAt,
          productCount,
          snapshotHash,
          wireBytes,
        },
        "Catalog client index prewarmed",
      );
    })
    .catch(() => {
      logger.warn("Catalog client index prewarm unavailable");
    });
});
