import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
} from "../lib/jwt.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { requireAuth } from "../middleware/auth.js";
import {
  clearFailedLogins,
  getLoginLockStatus,
  recordFailedLogin
} from "../lib/loginLockout.js";
import {
  consumePasswordResetToken,
  createPasswordResetToken
} from "../lib/passwordReset.js";
import { isSessionRevoked, revokeSession } from "../lib/sessionStore.js";
import { env } from "../config/env.js";
import { sendEmail } from "../services/mailer.js";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

function getRequestIp(req: { ip?: string; socket?: { remoteAddress?: string } }) {
  return req.ip ?? req.socket?.remoteAddress ?? "unknown";
}

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid login payload",
      errors: parsed.error.flatten()
    });
  }

  const ip = getRequestIp(req);
  const lockStatus = getLoginLockStatus(parsed.data.email, ip);

  if (lockStatus.locked) {
    return res.status(429).json({
      message: "Too many failed login attempts. Try again later.",
      lockedUntil: lockStatus.lockedUntil
    });
  }

  const user = await prisma.user.findUnique({
    where: {
      email: parsed.data.email
    }
  });

  if (!user) {
    const failed = recordFailedLogin(parsed.data.email, ip);

    return res.status(401).json({
      message: "Invalid email or password",
      attemptsRemaining: failed.attemptsRemaining
    });
  }

  const validPassword = await verifyPassword(
    parsed.data.password,
    user.passwordHash
  );

  if (!validPassword) {
    const failed = recordFailedLogin(parsed.data.email, ip);

    return res.status(401).json({
      message: "Invalid email or password",
      attemptsRemaining: failed.attemptsRemaining
    });
  }

  clearFailedLogins(parsed.data.email, ip);

  const tokenPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    orgId: user.orgId,
    sid: randomUUID()
  };

  const accessToken = signAccessToken(tokenPayload);
  const refreshToken = signRefreshToken(tokenPayload);

  return res.json({
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      orgId: user.orgId
    }
  });
});

authRouter.post("/refresh", async (req, res) => {
  const schema = z.object({
    refreshToken: z.string().min(1)
  });

  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid refresh payload"
    });
  }

  try {
    const payload = verifyRefreshToken(parsed.data.refreshToken);
    if (isSessionRevoked(payload.sid)) {
      return res.status(401).json({
        message: "Session has been revoked"
      });
    }
    const { iat: _iat, exp: _exp, ...tokenPayload } = payload as typeof payload & { iat?: number; exp?: number };
    const accessToken = signAccessToken(tokenPayload);

    return res.json({
      accessToken
    });
  } catch {
    return res.status(401).json({
      message: "Invalid refresh token"
    });
  }
});

authRouter.post("/logout", (req, res) => {
  const schema = z.object({
    refreshToken: z.string().optional()
  });

  const parsed = schema.safeParse(req.body ?? {});

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const payload = verifyAccessToken(authHeader.slice("Bearer ".length));
      revokeSession(payload.sid);
    } catch {
      // ignore invalid access token
    }
  }

  if (parsed.success && parsed.data.refreshToken) {
    try {
      const payload = verifyRefreshToken(parsed.data.refreshToken);
      revokeSession(payload.sid);
    } catch {
      // ignore invalid refresh token
    }
  }

  return res.json({
    message: "Logged out"
  });
});

authRouter.get("/me", requireAuth, async (req, res) => {
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

authRouter.post("/forgot-password", async (req, res) => {
  const schema = z.object({
    email: z.string().email()
  });

  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid forgot password payload"
    });
  }

  const user = await prisma.user.findUnique({
    where: {
      email: parsed.data.email
    }
  });

  let devResetToken: string | undefined;

  if (user) {
    const resetToken = createPasswordResetToken(user.email);
    const resetUrl = `${env.WEB_ORIGIN}/reset-password?token=${encodeURIComponent(resetToken)}`;

    await sendEmail({
      to: user.email,
      subject: "Reset your EmailOps password",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#172033;">
          <h1 style="font-size:22px;margin:0 0 12px;">Reset your password</h1>
          <p style="margin:0 0 16px;">Use the button below to create a new password for your EmailOps account.</p>
          <a href="${resetUrl}" style="display:inline-block;background:#155eef;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;">Reset password</a>
          <p style="margin:20px 0 0;color:#687386;font-size:13px;">If you did not request this, you can ignore this email.</p>
        </div>
      `,
      text: `Reset your EmailOps password: ${resetUrl}`
    });

    if (env.EMAIL_PROVIDER === "dev") {
      devResetToken = resetToken;
      console.log("[PASSWORD RESET]");
      console.log("Email:", user.email);
      console.log("Reset URL:", resetUrl);
    }
  }

  return res.json({
    message: "If an account exists, a password reset link has been sent.",
    devResetToken
  });
});

authRouter.post("/reset-password", async (req, res) => {
  const schema = z.object({
    token: z.string().min(1),
    password: z.string().min(8)
  });

  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid reset password payload",
      errors: parsed.error.flatten()
    });
  }

  const tokenRecord = consumePasswordResetToken(parsed.data.token);

  if (!tokenRecord) {
    return res.status(400).json({
      message: "Invalid or expired reset token"
    });
  }

  const passwordHash = await hashPassword(parsed.data.password);

  await prisma.user.update({
    where: {
      email: tokenRecord.email
    },
    data: {
      passwordHash
    }
  });

  return res.json({
    message: "Password reset successful"
  });
});
