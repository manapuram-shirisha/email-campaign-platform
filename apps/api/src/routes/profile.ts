import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { requireAuth } from "../middleware/auth.js";

export const profileRouter = Router();

profileRouter.use(requireAuth);

profileRouter.get("/", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: {
      id: req.user!.sub
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      orgId: true,
      createdAt: true,
      updatedAt: true
    }
  });

  if (!user) {
    return res.status(404).json({
      message: "User not found"
    });
  }

  return res.json({
    user
  });
});

profileRouter.put("/", async (req, res) => {
  const schema = z.object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional()
  });

  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid profile payload",
      errors: parsed.error.flatten()
    });
  }

  const user = await prisma.user.update({
    where: {
      id: req.user!.sub
    },
    data: parsed.data,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      orgId: true,
      createdAt: true,
      updatedAt: true
    }
  });

  return res.json({
    user
  });
});

profileRouter.put("/password", async (req, res) => {
  const schema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8)
  });

  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid password payload",
      errors: parsed.error.flatten()
    });
  }

  const user = await prisma.user.findUnique({
    where: {
      id: req.user!.sub
    }
  });

  if (!user) {
    return res.status(404).json({
      message: "User not found"
    });
  }

  const validPassword = await verifyPassword(
    parsed.data.currentPassword,
    user.passwordHash
  );

  if (!validPassword) {
    return res.status(401).json({
      message: "Current password is incorrect"
    });
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);

  await prisma.user.update({
    where: {
      id: user.id
    },
    data: {
      passwordHash
    }
  });

  return res.json({
    message: "Password updated"
  });
});
