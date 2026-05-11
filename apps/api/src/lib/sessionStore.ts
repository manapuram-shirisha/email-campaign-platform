const revokedSessionIds = new Set<string>();

export function revokeSession(sessionId: string) {
  revokedSessionIds.add(sessionId);
}

export function isSessionRevoked(sessionId?: string | null) {
  if (!sessionId) return false;
  return revokedSessionIds.has(sessionId);
}

