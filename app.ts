import "dotenv/config";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import swaggerUi from "swagger-ui-express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { pinoHttp } from "pino-http";

import logger from "./src/logger.ts";
import { corsMiddleware } from "./src/middleware/security.ts";
import { generateOpenApiDocument } from "./src/openapi.ts";
import authRoutes from "./src/routes/auth.routes.ts";
import announcementsRoutes from "./src/routes/announcements.routes.ts";

export const app = express();

// Security + logging middleware goes first so it covers every route.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        // Helmet's default would force Swagger UI assets to https on
        // http://localhost (breaks /api-docs in some browsers).
        "upgrade-insecure-requests": null,
      },
    },
  }),
);
app.use(corsMiddleware);
app.use(pinoHttp({ logger }));
app.use(express.json());
app.use(cookieParser());
const openApiDocument = generateOpenApiDocument();
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));

app.use("/auth", authRoutes);
app.use("/announcements", announcementsRoutes);

// 404 Not Found handler - must be after all routes
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// Error handling middleware
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Request failed");

  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      error: "Validation failed",
      details: {
        body: ["Invalid JSON format in request body"],
      },
    });
  }

  if (err.status && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }

  if (err.status === 502) {
    return res.status(502).json({ error: err.message });
  }

  if (err.code === "P2025") {
    return res.status(404).json({ error: "Resource not found" });
  }

  if (err.code === "P2002") {
    return res.status(409).json({ error: "Unique constraint violation" });
  }

  if (err.code === "P2003") {
    return res.status(400).json({ error: "Foreign key constraint failed" });
  }

  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 3000;

// Vitest sets VITEST, so tests import the app without opening a port.
if (!process.env.VITEST) {
  app.listen(PORT, () => {
    logger.info(
      `Server is running on port ${PORT}: http://localhost:${PORT}/api-docs`,
    );
  });
}
