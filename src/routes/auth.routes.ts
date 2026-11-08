import { Router } from "express";
import { z } from "zod";
import { registry } from "../openapi.ts";
import { authenticate } from "../middleware/authenticate.ts";
import { authRateLimiter } from "../middleware/security.ts";
import { validateBody } from "../middleware/validate.ts";
import * as controller from "../controllers/auth.controller.ts";
import {
  loginSchema,
  refreshSchema,
  registerSchema,
} from "../validators/auth.validator.ts";

const router = Router();

// Rate limiting applies to every auth route, and only to them.
router.use(authRateLimiter);

router.post("/register", validateBody(registerSchema), controller.register);
router.post("/login", validateBody(loginSchema), controller.login);
router.post("/refresh", validateBody(refreshSchema), controller.refresh);
router.post("/logout", authenticate, controller.logout);
router.get("/me", authenticate, controller.me);

export default router;

// ---------- OpenAPI ----------

const errorSchema = z.object({ error: z.string() });
const userSchema = z.object({
  id: z.number(),
  username: z.string(),
  email: z.string(),
  name: z.string(),
});
const tokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});
const json = <T extends z.ZodType>(schema: T) => ({
  "application/json": { schema },
});
const secured = [{ bearerAuth: [] }];
const tooMany = {
  description: "Too many requests, please try again later",
  content: json(errorSchema),
};

registry.registerPath({
  method: "post",
  path: "/auth/register",
  tags: ["Auth"],
  summary: "Register a new user",
  request: { body: { required: true, content: json(registerSchema) } },
  responses: {
    201: {
      description: "User created",
      content: json(z.object({ user: userSchema }).extend(tokensSchema.shape)),
    },
    400: { description: "Validation failed", content: json(errorSchema) },
    409: { description: "Username or email already taken", content: json(errorSchema) },
    429: tooMany,
  },
});

registry.registerPath({
  method: "post",
  path: "/auth/login",
  tags: ["Auth"],
  summary: "Log in",
  request: { body: { required: true, content: json(loginSchema) } },
  responses: {
    200: {
      description: "Logged in",
      content: json(z.object({ user: userSchema }).extend(tokensSchema.shape)),
    },
    400: { description: "Validation failed", content: json(errorSchema) },
    401: { description: "Invalid credentials", content: json(errorSchema) },
    429: tooMany,
  },
});

registry.registerPath({
  method: "post",
  path: "/auth/refresh",
  tags: ["Auth"],
  summary: "Refresh the token pair (token rotation)",
  request: { body: { required: true, content: json(refreshSchema) } },
  responses: {
    200: { description: "New token pair", content: json(tokensSchema) },
    400: { description: "Validation failed", content: json(errorSchema) },
    401: { description: "Invalid refresh token", content: json(errorSchema) },
    429: tooMany,
  },
});

registry.registerPath({
  method: "post",
  path: "/auth/logout",
  tags: ["Auth"],
  summary: "Log out (invalidate refresh token)",
  security: secured,
  responses: {
    204: { description: "Logged out" },
    401: { description: "Unauthorized", content: json(errorSchema) },
    429: tooMany,
  },
});

registry.registerPath({
  method: "get",
  path: "/auth/me",
  tags: ["Auth"],
  summary: "Current user profile",
  security: secured,
  responses: {
    200: {
      description: "Current user",
      content: json(userSchema.extend({ createdAt: z.string() })),
    },
    401: { description: "Unauthorized", content: json(errorSchema) },
    429: tooMany,
  },
});
