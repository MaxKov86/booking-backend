import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

export interface TokenPayload {
  userId: string;
}

/**
 * Access + refresh замість одного довгоживучого токена — свідомий вибір
 * (пункт з ТЗ). Логіка розділення:
 *
 * - ACCESS живе коротко (15хв): якщо його вкрадуть, вікно зловживання
 *   маленьке. Надсилається з КОЖНИМ запитом, тому ризик перехоплення вищий.
 * - REFRESH живе довго (7 днів): використовується РІДКО (лише щоб
 *   отримати новий access), тому менше шансів перехопити.
 *
 * Різні секрети для двох типів — щоб компрометація одного не давала
 * можливості підробити інший.
 */
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '7d';

function getAccessSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET не задано в .env');
  }
  return secret;
}

function getRefreshSecret(): string {
  // Якщо окремий refresh-секрет не заданий — деривуємо його з основного,
  // щоб не змушувати генерувати два секрети вручну для pet-проекту.
  // У продакшні краще задати JWT_REFRESH_SECRET явно, окремим значенням.
  return process.env.JWT_REFRESH_SECRET ?? `${getAccessSecret()}-refresh`;
}

export function hashPassword(password: string): Promise<string> {
  // 10 раундів — баланс між безпекою і швидкістю; стандартна рекомендація bcrypt
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateTokens(payload: TokenPayload) {
  return {
    accessToken: jwt.sign(payload, getAccessSecret(), { expiresIn: ACCESS_TOKEN_TTL }),
    refreshToken: jwt.sign(payload, getRefreshSecret(), { expiresIn: REFRESH_TOKEN_TTL }),
  };
}

/** Кидає помилку, якщо токен невалідний або прострочений — виклик має бути в try/catch */
export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, getAccessSecret()) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, getRefreshSecret()) as TokenPayload;
}
