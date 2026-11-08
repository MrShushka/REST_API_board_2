import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";
const isTest = Boolean(process.env.VITEST);

const logger = pino({
  level: isTest ? "silent" : (process.env.LOG_LEVEL ?? "info"),
  // Never write credentials to the logs.
  redact: ["req.headers.authorization", "req.headers.cookie"],
  // Pretty output for development only; plain JSON in production.
  transport:
    isProduction || isTest ? undefined : { target: "pino-pretty" },
});

export default logger;
