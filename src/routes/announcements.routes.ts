import { Router } from "express";
import { z } from "zod";
import { registry } from "../openapi.ts";
import { authenticate } from "../middleware/authenticate.ts";
import { uploadImage } from "../middleware/upload.ts";
import {
  requireAnyChange,
  validateBody,
  validateParams,
  validateQuery,
} from "../middleware/validate.ts";
import * as controller from "../controllers/announcements.controller.ts";
import {
  categories,
  createAnnouncementSchema,
  idParamSchema,
  listQuerySchema,
  updateAnnouncementSchema,
} from "../validators/announcements.validator.ts";

const router = Router();

router.get("/", validateQuery(listQuerySchema), controller.list);
router.get("/:id", validateParams(idParamSchema), controller.getOne);
router.post(
  "/",
  authenticate,
  uploadImage,
  validateBody(createAnnouncementSchema),
  controller.create,
);
router.patch(
  "/:id",
  authenticate,
  validateParams(idParamSchema),
  uploadImage,
  validateBody(updateAnnouncementSchema),
  requireAnyChange,
  controller.update,
);
router.delete(
  "/:id",
  authenticate,
  validateParams(idParamSchema),
  controller.remove,
);

export default router;

// ---------- OpenAPI ----------

const errorSchema = z.object({ error: z.string() });
const announcementSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string(),
  price: z.number(),
  category: z.enum(categories),
  imageUrl: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  user: z.object({
    id: z.number(),
    username: z.string(),
    email: z.string(),
    name: z.string(),
  }),
});
const imageFile = z
  .string()
  .openapi({
    type: "string",
    format: "binary",
    description: "Image file (JPEG, PNG or WebP, up to 5 MB)",
  })
  .optional();
const multipart = <T extends z.ZodType>(schema: T) => ({
  "multipart/form-data": { schema },
});
const json = <T extends z.ZodType>(schema: T) => ({
  "application/json": { schema },
});
const secured = [{ bearerAuth: [] }];
const params = z.object({ id: z.coerce.number().int().positive() });
const unauthorized = { description: "Unauthorized", content: json(errorSchema) };
const invalid = { description: "Validation failed", content: json(errorSchema) };
const notFound = { description: "Not found", content: json(errorSchema) };
const forbidden = { description: "Access denied", content: json(errorSchema) };

registry.registerPath({
  method: "get",
  path: "/announcements",
  tags: ["Announcements"],
  summary: "List announcements (pagination, search, sorting)",
  request: { query: listQuerySchema },
  responses: {
    200: {
      description: "Page of announcements",
      content: json(
        z.object({
          data: z.array(announcementSchema),
          pagination: z.object({
            total: z.number(),
            page: z.number(),
            totalPages: z.number(),
            perPage: z.number(),
          }),
        }),
      ),
    },
    400: invalid,
  },
});

registry.registerPath({
  method: "get",
  path: "/announcements/{id}",
  tags: ["Announcements"],
  summary: "Get an announcement by ID",
  request: { params },
  responses: {
    200: { description: "Announcement", content: json(announcementSchema) },
    400: invalid,
    404: notFound,
  },
});

registry.registerPath({
  method: "post",
  path: "/announcements",
  tags: ["Announcements"],
  summary: "Create an announcement",
  security: secured,
  description:
    "Send JSON, or multipart/form-data with an optional `image` file field.",
  request: {
    body: {
      required: true,
      content: {
        ...multipart(createAnnouncementSchema.extend({ image: imageFile })),
        ...json(createAnnouncementSchema),
      },
    },
  },
  responses: {
    201: { description: "Created", content: json(announcementSchema) },
    400: invalid,
    401: unauthorized,
  },
});

registry.registerPath({
  method: "patch",
  path: "/announcements/{id}",
  tags: ["Announcements"],
  summary: "Partially update your own announcement",
  description:
    "Send JSON, or multipart/form-data with an optional `image` file field. At least one field or an image is required.",
  security: secured,
  request: {
    params,
    body: {
      required: true,
      content: {
        ...multipart(updateAnnouncementSchema.extend({ image: imageFile })),
        ...json(updateAnnouncementSchema),
      },
    },
  },
  responses: {
    200: { description: "Updated", content: json(announcementSchema) },
    400: invalid,
    401: unauthorized,
    403: forbidden,
    404: notFound,
  },
});

registry.registerPath({
  method: "delete",
  path: "/announcements/{id}",
  tags: ["Announcements"],
  summary: "Delete your own announcement",
  security: secured,
  request: { params },
  responses: {
    204: { description: "Deleted" },
    400: invalid,
    401: unauthorized,
    403: forbidden,
    404: notFound,
  },
});
