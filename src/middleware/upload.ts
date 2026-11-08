import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import createError from "http-errors";
import multer from "multer";

export const UPLOAD_DIR = path.resolve("uploads");
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  // Random name: the client's file name is never used on disk.
  filename: (_req, file, cb) =>
    cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
});

const multerUpload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) return cb(null, true);
    cb(createError(400, "Only JPEG, PNG and WebP images are allowed"));
  },
});

const single = multerUpload.single("image");

/**
 * Accepts an optional "image" file field. Requests that are not
 * multipart/form-data (plain JSON) pass through untouched.
 */
export function uploadImage(req: Request, res: Response, next: NextFunction) {
  if (!req.is("multipart/form-data")) return next();

  // Safety net: whatever happens later (validation error, 403, 404, ...),
  // never leave the temporary file on disk once the response is done.
  res.on("close", () => {
    if (req.file) fs.unlink(req.file.path, () => {});
  });

  single(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? "Image must be 5 MB or smaller"
          : err.code === "LIMIT_UNEXPECTED_FILE"
            ? 'Image must be sent in the "image" field'
            : err.message;
      return next(createError(400, message));
    }
    next(err);
  });
}
