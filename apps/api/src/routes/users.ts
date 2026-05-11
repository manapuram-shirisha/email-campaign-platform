import { Router } from "express";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { hashPassword } from "../lib/password.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";

export const usersRouter = Router();

usersRouter.use(requireAuth);
usersRouter.use(requireRole("SUPER_ADMIN"));

usersRouter.get("/", async (req, res) => {
  const users = await prisma.user.findMany({
    where: {
      orgId: req.user!.orgId
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      updatedAt: true
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  return res.json({
    users
  });
});

usersRouter.post("/invite", async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    name: z.string().optional(),
    role: z.nativeEnum(UserRole).default(UserRole.CAMPAIGN_MANAGER),
    temporaryPassword: z.string().min(8).default("Temp@1234")
  });

  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid invite payload",
      errors: parsed.error.flatten()
    });
  }

  const passwordHash = await hashPassword(parsed.data.temporaryPassword);

  const user = await prisma.user.create({
    data: {
      email: parsed.data.email,
      name: parsed.data.name,
      role: parsed.data.role,
      passwordHash,
      orgId: req.user!.orgId
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

  return res.status(201).json({
    user,
    temporaryPassword: parsed.data.temporaryPassword
  });
});

usersRouter.put("/:id", async (req, res) => {
  const schema = z.object({
    name: z.string().optional(),
    role: z.nativeEnum(UserRole).optional()
  });

  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid user payload",
      errors: parsed.error.flatten()
    });
  }

  const existingUser = await prisma.user.findFirst({
    where: {
      id: req.params.id,
      orgId: req.user!.orgId
    }
  });

  if (!existingUser) {
    return res.status(404).json({
      message: "User not found"
    });
  }

  const user = await prisma.user.update({
    where: {
      id: existingUser.id
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

usersRouter.post("/:id/deactivate", async (req, res) => {
  const existingUser = await prisma.user.findFirst({
    where: {
      id: req.params.id,
      orgId: req.user!.orgId
    }
  });

  if (!existingUser) {
    return res.status(404).json({
      message: "User not found"
    });
  }

  if (existingUser.id === req.user!.sub) {
    return res.status(400).json({
      message: "You cannot deactivate your own user"
    });
  }

  await prisma.user.delete({
    where: {
      id: existingUser.id
    }
  });

  return res.json({
    message: "User deactivated"
  });
});
