import type { NextFunction, Request, Response } from "express";
import createError from "http-errors";
import jwt from "jsonwebtoken";
import { getJwtSecret } from "../config.ts";

export interface AuthUser {
  sub: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const [scheme, token] = header?.split(" ") ?? [];

  if (scheme !== "Bearer" || !token) {
    return next(createError(401, "Unauthorized"));
  }

  try {
    const payload = jwt.verify(token, getJwtSecret());
    if (
      typeof payload === "string" ||
      payload.type !== "access" ||
      typeof payload.sub !== "string"
    ) {
      return next(createError(401, "Unauthorized"));
    }
    req.user = { sub: payload.sub };
    next();
  } catch {
    next(createError(401, "Unauthorized"));
  }
}
