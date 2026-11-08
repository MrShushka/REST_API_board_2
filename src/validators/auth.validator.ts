import { z } from "zod";

export const registerSchema = z.object({
  username: z.string().trim().min(3).max(30),
  email: z.email().trim().toLowerCase(),
  password: z.string().min(6),
  name: z.string().trim().min(2),
});

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
