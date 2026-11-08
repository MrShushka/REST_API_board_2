import fs from "node:fs/promises";
import type { Request, Response } from "express";
import createError from "http-errors";
import prisma from "../../prisma/client.ts";
import cloudinary from "../cloudinary.ts";
import { PER_PAGE } from "../config.ts";
import logger from "../logger.ts";
import type {
  CreateAnnouncementInput,
  IdParam,
  ListQuery,
  UpdateAnnouncementInput,
} from "../validators/announcements.validator.ts";

// Response shape from the spec: no userId, author is nested under "user".
const select = {
  id: true,
  title: true,
  description: true,
  price: true,
  category: true,
  imageUrl: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, username: true, email: true, name: true } },
} as const;

/**
 * Uploads the temporary file to Cloudinary and always removes it from disk,
 * whether the upload succeeded or not. Returns the Cloudinary URL.
 */
async function uploadToCloudinary(
  file: Express.Multer.File,
  userId: number,
): Promise<string> {
  try {
    const result = await cloudinary.uploader.upload(file.path, {
      folder: "announcements",
    });
    logger.info(
      { userId, publicId: result.public_id, bytes: result.bytes },
      "Announcement photo uploaded to Cloudinary",
    );
    return result.secure_url;
  } catch (err) {
    logger.error({ err, userId }, "Cloudinary upload failed");
    throw createError(502, "Failed to upload image");
  } finally {
    await fs.unlink(file.path).catch(() => {});
  }
}

export async function list(_req: Request, res: Response) {
  const { search, sort, page } = res.locals.query as ListQuery;

  const where = search
    ? { title: { contains: search, mode: "insensitive" as const } }
    : {};

  const [total, data] = await Promise.all([
    prisma.announcement.count({ where }),
    prisma.announcement.findMany({
      where,
      select,
      orderBy: { createdAt: sort === "oldest" ? "asc" : "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
  ]);

  res.json({
    data,
    pagination: {
      total,
      page,
      totalPages: Math.ceil(total / PER_PAGE),
      perPage: PER_PAGE,
    },
  });
}

export async function getOne(_req: Request, res: Response) {
  const { id } = res.locals.params as IdParam;

  const announcement = await prisma.announcement.findUnique({
    where: { id },
    select,
  });
  if (!announcement) {
    throw createError(404, "Announcement not found");
  }
  res.json(announcement);
}

export async function create(req: Request, res: Response) {
  const data = req.body as CreateAnnouncementInput;
  const userId = Number(req.user!.sub);

  const imageUrl = req.file
    ? await uploadToCloudinary(req.file, userId)
    : undefined;

  const announcement = await prisma.announcement.create({
    // The author always comes from the token, never from the request body.
    data: { ...data, userId, imageUrl },
    select,
  });
  logger.info(
    { userId, announcementId: announcement.id, hasImage: Boolean(imageUrl) },
    "Announcement created",
  );
  res.status(201).json(announcement);
}

async function findOwned(id: number, sub: string) {
  const announcement = await prisma.announcement.findUnique({ where: { id } });
  if (!announcement) {
    throw createError(404, "Announcement not found");
  }
  if (announcement.userId !== Number(sub)) {
    throw createError(403, "Access denied");
  }
  return announcement;
}

export async function update(req: Request, res: Response) {
  const { id } = res.locals.params as IdParam;
  await findOwned(id, req.user!.sub);
  const userId = Number(req.user!.sub);

  const imageUrl = req.file
    ? await uploadToCloudinary(req.file, userId)
    : undefined;

  const announcement = await prisma.announcement.update({
    where: { id },
    data: { ...(req.body as UpdateAnnouncementInput), imageUrl },
    select,
  });
  logger.info(
    { userId, announcementId: id, imageChanged: Boolean(imageUrl) },
    "Announcement updated",
  );
  res.json(announcement);
}

export async function remove(req: Request, res: Response) {
  const { id } = res.locals.params as IdParam;
  await findOwned(id, req.user!.sub);

  await prisma.announcement.delete({ where: { id } });
  logger.info(
    { userId: Number(req.user!.sub), announcementId: id },
    "Announcement deleted",
  );
  res.status(204).end();
}
