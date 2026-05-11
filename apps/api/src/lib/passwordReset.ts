import crypto from "node:crypto";

type PasswordResetToken = {
  email: string;
  token: string;
  expiresAt: number;
};

const resetTokens = new Map<string, PasswordResetToken>();

const RESET_MINUTES = 15;

export function createPasswordResetToken(email: string) {
  const token = crypto.randomBytes(32).toString("hex");

  resetTokens.set(token, {
    email: email.toLowerCase(),
    token,
    expiresAt: Date.now() + RESET_MINUTES * 60 * 1000
  });

  return token;
}

export function consumePasswordResetToken(token: string) {
  const record = resetTokens.get(token);

  if (!record) {
    return null;
  }

  resetTokens.delete(token);

  if (Date.now() > record.expiresAt) {
    return null;
  }

  return {
    email: record.email
  };
}
