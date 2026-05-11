import { SuppressionReason } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";

export const suppressionRouter = Router();

suppressionRouter.use(requireAuth);

const writeAccess = requireRole("SUPER_ADMIN", "CAMPAIGN_MANAGER");

suppressionRouter.get("/", async (req, res) => {
  const items = await prisma.suppressionList.findMany({
    where: { orgId: req.user!.orgId },
    orderBy: { suppressedAt: "desc" }
  });
  return res.json({ items });
});

suppressionRouter.post("/", writeAccess, async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    reason: z.nativeEnum(SuppressionReason).default(SuppressionReason.MANUAL)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

  const item = await prisma.suppressionList.upsert({
    where: {
      orgId_email: {
        orgId: req.user!.orgId,
        email: parsed.data.email.toLowerCase()
      }
    },
    update: { reason: parsed.data.reason },
    create: {
      orgId: req.user!.orgId,
      email: parsed.data.email.toLowerCase(),
      reason: parsed.data.reason
    }
  });

  await prisma.contact.updateMany({
    where: {
      orgId: req.user!.orgId,
      email: parsed.data.email.toLowerCase()
    },
    data: { status: "UNSUBSCRIBED" }
  });

  return res.status(201).json({ item });
});

suppressionRouter.delete("/:id", writeAccess, async (req, res) => {
  const item = await prisma.suppressionList.findFirst({
    where: {
      id: String(req.params.id),
      orgId: req.user!.orgId
    }
  });
  if (!item) return res.status(404).json({ message: "Entry not found" });

  await prisma.suppressionList.delete({ where: { id: item.id } });

  await prisma.contact.updateMany({
    where: {
      orgId: req.user!.orgId,
      email: item.email
    },
    data: { status: "ACTIVE" }
  });

  return res.json({ message: "Suppression entry removed" });
});
