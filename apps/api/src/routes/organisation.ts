import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";

export const organisationRouter = Router();
organisationRouter.use(requireAuth);

const writeAccess = requireRole("SUPER_ADMIN");

organisationRouter.get("/", async (req, res) => {
  const organisation = await prisma.organisation.findUnique({
    where: { id: req.user!.orgId }
  });
  if (!organisation) return res.status(404).json({ message: "Organisation not found" });
  return res.json({ organisation });
});

organisationRouter.put("/", writeAccess, async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    logoUrl: z.string().url().optional().nullable(),
    fromEmail: z.string().email().optional().nullable(),
    sesConfigSet: z.string().optional().nullable(),
    awsRegion: z.string().min(1).default("ap-south-1")
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

  const organisation = await prisma.organisation.update({
    where: { id: req.user!.orgId },
    data: {
      name: parsed.data.name,
      logoUrl: parsed.data.logoUrl ?? null,
      fromEmail: parsed.data.fromEmail ?? null,
      sesConfigSet: parsed.data.sesConfigSet ?? null,
      awsRegion: parsed.data.awsRegion
    }
  });

  return res.json({ organisation, message: "Organisation settings updated" });
});
