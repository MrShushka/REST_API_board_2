import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

type Source = "body" | "params" | "query";

function validate(source: Source, schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const messages = result.error.issues.map((issue) =>
        issue.path.length
          ? `${issue.path.join(".")}: ${issue.message}`
          : issue.message,
      );
      return res
        .status(400)
        .json({ error: "Validation failed", details: { [source]: messages } });
    }

    // In Express 5 req.query is a read-only getter, so parsed params/query
    // go to res.locals; the body can be safely replaced.
    if (source === "body") {
      req.body = result.data;
    } else {
      res.locals[source] = result.data;
    }
    next();
  };
}

export const validateBody = (schema: ZodType) => validate("body", schema);
export const validateParams = (schema: ZodType) => validate("params", schema);
export const validateQuery = (schema: ZodType) => validate("query", schema);

/** PATCH guard: the request must change something (a field or the image). */
export function requireAnyChange(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (Object.keys(req.body ?? {}).length === 0 && !req.file) {
    return res.status(400).json({
      error: "Validation failed",
      details: { body: ["At least one field or an image must be provided"] },
    });
  }
  next();
}
