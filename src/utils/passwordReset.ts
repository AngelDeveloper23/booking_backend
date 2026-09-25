import crypto from 'crypto';

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// Only the hash is ever stored (mirrors how passwordHash never stores the
// raw password) so a database read alone can't be used to reset an account.
export function hashResetToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function generateResetToken(): { rawToken: string; tokenHash: string; expiresAt: Date } {
  const rawToken = crypto.randomBytes(32).toString('hex');
  return {
    rawToken,
    tokenHash: hashResetToken(rawToken),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
  };
}
