import { z } from "zod";

export const categories = ["sale", "service", "job", "other"] as const;

export const createAnnouncementSchema = z.object({
  title: z.string().trim().min(5).max(50),
  description: z.string().trim().min(10),
  // multipart/form-data sends every field as a string, so coerce to number.
  price: z.coerce.number().positive(),
  category: z.enum(categories),
});

// "At least one field or a new image" is checked in requireAnyChange,
// because the image arrives as a file, not as a body field.
export const updateAnnouncementSchema = createAnnouncementSchema.partial();

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive().max(2147483647),
});

export const listQuerySchema = z.object({
  search: z.string().optional(),
  sort: z.enum(["newest", "oldest"]).optional().default("newest"),
  page: z.coerce.number().int().positive().max(1_000_000).optional().default(1),
});

export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>;
export type IdParam = z.infer<typeof idParamSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
