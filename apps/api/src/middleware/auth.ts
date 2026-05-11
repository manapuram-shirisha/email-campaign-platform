import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../lib/jwt.js";
import { isSessionRevoked } from "../lib/sessionStore.js";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Missing authorization token"
    });
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = verifyAccessToken(token);

    if (isSessionRevoked(payload.sid)) {
      return res.status(401).json({
        message: "Session has been revoked"
      });
    }

    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({
      message: "Invalid or expired token"
    });
  }
}
