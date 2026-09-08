import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../services/authService';

/**
 * Розширюємо тип Express Request, щоб req.user був типізований у всіх
 * захищених роутах, а не any. declare global + namespace Express — це
 * офіційний спосіб module augmentation для @types/express.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { userId: string };
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  // Формат "Bearer <token>" — стандарт RFC 6750 для передачі токенів
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Потрібна авторизація' });
    return;
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    const payload = verifyAccessToken(token);
    req.user = { userId: payload.userId };
    next();
  } catch {
    // jwt.verify кидає і на невалідний підпис, і на прострочений токен.
    // Навмисно НЕ розрізняємо їх у відповіді клієнту — деталі про причину
    // відмови дають зайву інформацію потенційному зловмиснику.
    res.status(401).json({ message: 'Невалідний або прострочений токен' });
  }
}

/**
 * Перевіряє, що залогинений юзер працює зі СВОЇМИ даними.
 * Без цього будь-який авторизований користувач міг би читати/змінювати
 * чужі бронювання, просто підставивши інший :userId в URL —
 * класична IDOR-вразливість (Insecure Direct Object Reference).
 */
export function requireOwnership(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.userId !== req.params.userId) {
    res.status(403).json({ message: 'Немає доступу до чужих даних' });
    return;
  }
  next();
}
