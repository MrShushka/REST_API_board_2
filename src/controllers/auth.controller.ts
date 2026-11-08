import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import createError from "http-errors";
import jwt from "jsonwebtoken";
import prisma from "../../prisma/client.ts";
import logger from "../logger.ts";
import {
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL,
  getJwtSecret,
} from "../config.ts";
import type {
  LoginInput,
  RefreshInput,
  RegisterInput,
} from "../validators/auth.validator.ts";

const SALT_ROUNDS = 10;
// Used to keep response time similar when the username does not exist.
const DUMMY_HASH = bcrypt.hashSync("dummy-password", SALT_ROUNDS);

const publicUser = {
  id: true,
  username: true,
  email: true,
  name: true,
} as const;

export function signTokens(userId: number) {
  const secret = getJwtSecret();
  const subject = String(userId);

  const accessToken = jwt.sign({ type: "access" }, secret, {
    subject,
    expiresIn: ACCESS_TOKEN_TTL,
  });
  // jti makes every refresh token unique, even if issued in the same second.
  const refreshToken = jwt.sign({ type: "refresh", jti: randomUUID() }, secret, {
    subject,
    expiresIn: REFRESH_TOKEN_TTL,
  });

  return { accessToken, refreshToken };
}

export async function register(req: Request, res: Response) {
  const { username, email, password, name } = req.body as RegisterInput;

  const existing = await prisma.user.findFirst({
    where: { OR: [{ username }, { email }] },
    select: { id: true },
  });
  if (existing) {
    throw createError(409, "Username or email already taken");
  }

  const hashed = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: { username, email, password: hashed, name },
    select: publicUser,
  });

  const tokens = signTokens(user.id);
  await prisma.refreshToken.create({
    data: { token: tokens.refreshToken, userId: user.id },
  });

  logger.info({ userId: user.id, username: user.username }, "User registered");
  res.status(201).json({ user, ...tokens });
}

export async function login(req: Request, res: Response) {
  const { username, password } = req.body as LoginInput;

  const user = await prisma.user.findUnique({ where: { username } });
  const valid = await bcrypt.compare(password, user?.password ?? DUMMY_HASH);
  if (!user || !valid) {
    logger.warn({ username }, "Failed login attempt");
    throw createError(401, "Invalid credentials");
  }

  const tokens = signTokens(user.id);
  // The previous refresh token is replaced by the new one.
  await prisma.$transaction([
    prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
    prisma.refreshToken.create({
      data: { token: tokens.refreshToken, userId: user.id },
    }),
  ]);

  logger.info({ userId: user.id, username: user.username }, "User logged in");
  res.json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
    },
    ...tokens,
  });
}

export async function refresh(req: Request, res: Response) {
  const { refreshToken } = req.body as RefreshInput;

  let userId: number;
  try {
    const payload = jwt.verify(refreshToken, getJwtSecret());
    if (
      typeof payload === "string" ||
      payload.type !== "refresh" ||
      typeof payload.sub !== "string"
    ) {
      throw new Error("Not a refresh token");
    }
    userId = Number(payload.sub);
  } catch {
    throw createError(401, "Invalid refresh token");
  }

  const tokens = signTokens(userId);

  // Token rotation: delete the old token and store the new one atomically.
  // deleteMany's count tells us whether the old token really was in the DB.
  const rotated = await prisma.$transaction(async (tx) => {
    const { count } = await tx.refreshToken.deleteMany({
      where: { token: refreshToken, userId },
    });
    if (count === 0) return false;
    await tx.refreshToken.create({
      data: { token: tokens.refreshToken, userId },
    });
    return true;
  });

  if (!rotated) {
    throw createError(401, "Invalid refresh token");
  }

  res.json(tokens);
}

export async function logout(req: Request, res: Response) {
  await prisma.refreshToken.deleteMany({
    where: { userId: Number(req.user!.sub) },
  });
  logger.info({ userId: Number(req.user!.sub) }, "User logged out");
  res.status(204).end();
}

export async function me(req: Request, res: Response) {
  const user = await prisma.user.findUnique({
    where: { id: Number(req.user!.sub) },
    select: { ...publicUser, createdAt: true },
  });
  if (!user) {
    throw createError(401, "Unauthorized");
  }
  res.json(user);
}
