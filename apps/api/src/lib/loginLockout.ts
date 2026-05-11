type LoginAttempt = {
  count: number;
  lockedUntil?: number;
};

const attempts = new Map<string, LoginAttempt>();

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

function getKey(email: string, ip: string) {
  return `${email.toLowerCase()}:${ip}`;
}

export function getLoginLockStatus(email: string, ip: string) {
  const key = getKey(email, ip);
  const attempt = attempts.get(key);

  if (!attempt?.lockedUntil) {
    return {
      locked: false
    };
  }

  if (Date.now() > attempt.lockedUntil) {
    attempts.delete(key);
    return {
      locked: false
    };
  }

  return {
    locked: true,
    lockedUntil: new Date(attempt.lockedUntil).toISOString()
  };
}

export function recordFailedLogin(email: string, ip: string) {
  const key = getKey(email, ip);
  const current = attempts.get(key) ?? {
    count: 0
  };

  const nextCount = current.count + 1;

  if (nextCount >= MAX_ATTEMPTS) {
    attempts.set(key, {
      count: nextCount,
      lockedUntil: Date.now() + LOCK_MINUTES * 60 * 1000
    });

    return {
      locked: true,
      attemptsRemaining: 0
    };
  }

  attempts.set(key, {
    count: nextCount
  });

  return {
    locked: false,
    attemptsRemaining: MAX_ATTEMPTS - nextCount
  };
}

export function clearFailedLogins(email: string, ip: string) {
  attempts.delete(getKey(email, ip));
}
