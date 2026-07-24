import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

export interface AppOptions {
  nodeEnv?: string;
  frontendDist?: string;
}

const defaultFrontendDist = fileURLToPath(
  new URL("../../pharmacy/dist/public", import.meta.url),
);

export function createApp(options: AppOptions = {}): Express {
  const app: Express = express();
  const frontendDist = options.frontendDist ?? defaultFrontendDist;
  const frontendAssets = join(frontendDist, "assets");
  const frontendIndex = join(frontendDist, "index.html");
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;

  app.disable("x-powered-by");
  app.use(
    pinoHttp({
      logger,
      serializers: {
        req(req) {
          return {
            id: req.id,
            method: req.method,
            url: req.url?.split("?")[0],
          };
        },
        res(res) {
          return {
            statusCode: res.statusCode,
          };
        },
      },
    }),
  );
  app.use(cors());
  app.use(cookieParser());
  app.use(express.json({ limit: "12mb" }));
  app.use(express.urlencoded({ extended: true, limit: "12mb" }));

  app.use("/api", router);

  // Unknown API route -> consistent JSON 404.
  app.use("/api", (_req: Request, res: Response) => {
    res.status(404).json({ error: "Не знайдено" });
  });

  if (nodeEnv === "production" && existsSync(frontendIndex)) {
    app.use(
      "/assets",
      express.static(frontendAssets, {
        immutable: true,
        index: false,
        maxAge: "1y",
      }),
    );
    app.use(
      express.static(frontendDist, {
        index: false,
        maxAge: "1h",
      }),
    );
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== "GET" || req.path.startsWith("/api")) {
        next();
        return;
      }
      res.set("Cache-Control", "no-cache");
      res.sendFile(frontendIndex);
    });
  }

  // Central error handler: log the cause, return a safe JSON message. Express 5
  // forwards rejected async handlers here automatically.
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    req.log.error({ err }, "Unhandled request error");
    if (res.headersSent) return;
    res.status(500).json({ error: "Внутрішня помилка сервера" });
  });

  return app;
}

const app: Express = createApp();

export default app;
