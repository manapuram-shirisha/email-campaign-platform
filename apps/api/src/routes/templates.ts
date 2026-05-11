import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { uploadAsset } from "../services/storage.js";

export const templatesRouter = Router();

templatesRouter.use(requireAuth);

const writeAccess = requireRole("SUPER_ADMIN", "CAMPAIGN_MANAGER");

const templateSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  blocks: z.array(z.unknown()).default([]),
  html: z.string().min(1),
  thumbnailUrl: z.string().url().optional().nullable()
});

const uploadSchema = z.object({
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  dataBase64: z.string().min(1)
});

function toJsonArray(value: unknown[]): Prisma.InputJsonArray {
  return value as Prisma.InputJsonArray;
}

templatesRouter.get("/", async (req, res) => {
  const search = String(req.query.search ?? "").trim();
  const category = String(req.query.category ?? "").trim();

  const templates = await prisma.template.findMany({
    where: {
      orgId: req.user!.orgId,
      ...(search
        ? {
            name: {
              contains: search,
              mode: "insensitive"
            }
          }
        : {}),
      ...(category ? { category } : {})
    },
    orderBy: {
      updatedAt: "desc"
    }
  });

  return res.json({ templates });
});

templatesRouter.post("/", writeAccess, async (req, res) => {
  const parsed = templateSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid template payload",
      errors: parsed.error.flatten()
    });
  }

  const template = await prisma.template.create({
    data: {
      orgId: req.user!.orgId,
      name: parsed.data.name,
      category: parsed.data.category,
      blocks: toJsonArray(parsed.data.blocks),
      html: parsed.data.html,
      thumbnailUrl: parsed.data.thumbnailUrl ?? null
    }
  });

  return res.status(201).json({ template });
});

templatesRouter.post("/upload-asset", writeAccess, async (req, res) => {
  const parsed = uploadSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid asset payload",
      errors: parsed.error.flatten()
    });
  }

  try {
    const safeFileName = parsed.data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `templates/${req.user!.orgId}/${Date.now()}-${safeFileName}`;
    const body = Buffer.from(parsed.data.dataBase64, "base64");

    const result = await uploadAsset({
      key,
      body,
      contentType: parsed.data.contentType
    });

    return res.status(201).json({
      url: result.url,
      key: result.key
    });
  } catch (error) {
    console.error("[POST /api/templates/upload-asset]", error);
    return res.status(500).json({
      message: "Failed to upload template asset"
    });
  }
});

templatesRouter.get("/:id", async (req, res) => {
  const template = await prisma.template.findFirst({
    where: {
      id: String(req.params.id),
      orgId: req.user!.orgId
    }
  });

  if (!template) {
    return res.status(404).json({ message: "Template not found" });
  }

  return res.json({ template });
});

templatesRouter.put("/:id", writeAccess, async (req, res) => {
  const parsed = templateSchema.partial().safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid template payload",
      errors: parsed.error.flatten()
    });
  }

  const existing = await prisma.template.findFirst({
    where: {
      id: String(req.params.id),
      orgId: req.user!.orgId
    }
  });

  if (!existing) {
    return res.status(404).json({ message: "Template not found" });
  }

  const template = await prisma.template.update({
    where: { id: existing.id },
    data: {
      name: parsed.data.name,
      category: parsed.data.category,
      blocks:
        parsed.data.blocks === undefined
          ? undefined
          : toJsonArray(parsed.data.blocks),
      html: parsed.data.html,
      thumbnailUrl:
        parsed.data.thumbnailUrl === undefined
          ? undefined
          : parsed.data.thumbnailUrl ?? null
    }
  });

  return res.json({ template });
});

templatesRouter.delete("/:id", writeAccess, async (req, res) => {
  const existing = await prisma.template.findFirst({
    where: {
      id: String(req.params.id),
      orgId: req.user!.orgId
    }
  });

  if (!existing) {
    return res.status(404).json({ message: "Template not found" });
  }

  await prisma.template.delete({
    where: { id: existing.id }
  });

  return res.json({ message: "Template deleted" });
});

templatesRouter.post("/:id/duplicate", writeAccess, async (req, res) => {
  const existing = await prisma.template.findFirst({
    where: {
      id: String(req.params.id),
      orgId: req.user!.orgId
    }
  });

  if (!existing) {
    return res.status(404).json({ message: "Template not found" });
  }

  const duplicate = await prisma.template.create({
    data: {
      orgId: existing.orgId,
      name: `${existing.name} (Copy)`,
      category: existing.category,
      blocks: Array.isArray(existing.blocks)
        ? (existing.blocks as Prisma.InputJsonArray)
        : ([] as Prisma.InputJsonArray),
      html: existing.html,
      thumbnailUrl: existing.thumbnailUrl
    }
  });

  return res.status(201).json({ template: duplicate });
});
