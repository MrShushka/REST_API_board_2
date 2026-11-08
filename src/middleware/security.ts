import "dotenv/config";
import cors from "cors";
import createError from "http-errors";
import rateLimit from "express-rate-limit";

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);

export const corsMiddleware = cors({
  origin(origin, callback) {
    // Requests without an Origin header (curl, Postman, server-to-server)
    // are not browser cross-origin requests, so they are allowed.
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(createError(403, "Origin not allowed by CORS"));
  },
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});
