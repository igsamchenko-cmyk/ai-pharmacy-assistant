import { existsSync } from "node:fs";
import { basename, join } from "node:path";
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

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
].join("; ");

function normalizedHttpOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("CORS_ALLOWED_ORIGINS accepts only HTTP(S) origins.");
  }
  return url.origin;
}

export function parseCorsAllowedOrigins(
  value: string | undefined,
): Set<string> {
  const origins = new Set<string>();
  for (const item of (value ?? "").split(/[,;\n]/u)) {
    const candidate = item.trim();
    if (candidate) origins.add(normalizedHttpOrigin(candidate));
  }
  return origins;
}

function requestOrigin(req: Request): string | null {
  const host = req.get("host");
  return host ? `${req.protocol}://${host}` : null;
}

function crossOriginAllowed(
  req: Request,
  allowedOrigins: ReadonlySet<string>,
  nodeEnv: string | undefined,
): boolean {
  const header = req.get("origin");
  if (!header) return true;

  let origin: string;
  try {
    origin = normalizedHttpOrigin(header);
  } catch {
    return false;
  }

  if (origin === requestOrigin(req)) return true;
  if (allowedOrigins.has(origin)) return true;
  return nodeEnv !== "production" && allowedOrigins.size === 0;
}

function applySecurityHeaders(
  _req: Request,
  res: Response,
  next: NextFunction,
  nodeEnv: string | undefined,
): void {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
  });
  if (nodeEnv === "production") {
    res.set({
      "Content-Security-Policy": CONTENT_SECURITY_POLICY,
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    });
  }
  next();
}

export function createApp(options: AppOptions = {}): Express {
  const app: Express = express();
  const frontendDist = options.frontendDist ?? defaultFrontendDist;
  const frontendAssets = join(frontendDist, "assets");
  const frontendIndex = join(frontendDist, "index.html");
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
  const allowedCorsOrigins = parseCorsAllowedOrigins(
    process.env.CORS_ALLOWED_ORIGINS,
  );

  app.disable("x-powered-by");
  if (nodeEnv === "production") app.set("trust proxy", 1);
  app.use(
    pinoHttp({
      logger,
      serializers: {
        req(req) {
          return {
            id: req.id,
            method: req.method,
            url: req.url?.split("?")[0],
            cfRay: req.headers["cf-ray"] ?? null,
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
  app.use((req: Request, res: Response, next: NextFunction) => {
    applySecurityHeaders(req, res, next, nodeEnv);
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!crossOriginAllowed(req, allowedCorsOrigins, nodeEnv)) {
      res.status(403).json({ error: "Cross-origin request is not allowed" });
      return;
    }
    next();
  });
  app.use(
    cors({
      credentials: true,
      maxAge: 600,
      origin: true,
    }),
  );
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
        setHeaders(res, filePath) {
          if (
            basename(filePath) === "sw.js" ||
            basename(filePath) === "manifest.webmanifest"
          ) {
            res.setHeader("Cache-Control", "no-cache");
          }
        },
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
