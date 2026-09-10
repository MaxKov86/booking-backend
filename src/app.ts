import express from 'express';
import cors from 'cors';
import { availabilityRouter } from './routes/availability.routes';
import { bookingsRouter } from './routes/bookings.routes';
import { authRouter } from './routes/auth.routes';

export const app = express();

/**
 * CORS_ORIGIN приймає СПИСОК через кому — не один рядок. Причина:
 * Vercel створює унікальний URL для кожного preview-деплою
 * (напр. booking-frontend-git-feature-x.vercel.app), і з одним
 * захардкодженим origin усі preview-и блокувались би CORS-ом.
 *
 * Приклад: CORS_ORIGIN=https://myapp.vercel.app,http://localhost:3000
 */
const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // origin === undefined для запитів без Origin-заголовка
      // (curl, Postman, server-to-server) — пропускаємо, бо CORS
      // захищає браузерні запити, а не ці
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Not allowed by CORS'));
    },
  })
);
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRouter);
app.use('/api/availability', availabilityRouter);
app.use('/api/bookings', bookingsRouter);

/**
 * Централізований error-handler — 4 аргументи (err, req, res, next)
 * сигналізують Express, що це саме error-middleware, а не звичайний
 * роут. Express 5 (яку ми використовуємо) сам ловить помилки з async
 * route-хендлерів і передає їх сюди — не треба огортати кожен роут
 * у try/catch вручну, як довелось би в Express 4.
 */
app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[error]', err);

    // CORS-відмова — це не збій сервера (500), а відмова в доступі.
    // Без цієї гілки заблокований origin повертав би 500 і засмічував
    // логи стектрейсами, хоча це очікувана, штатна поведінка
    if (err instanceof Error && err.message === 'Not allowed by CORS') {
      res.status(403).json({ message: 'Origin не дозволений політикою CORS' });
      return;
    }

    // Mongoose duplicate key (напр. подвійне бронювання того самого
    // слоту — унікальний індекс у моделі Booking) — код 11000
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === 11000) {
      res.status(409).json({ message: 'Цей запис конфліктує з уже існуючим' });
      return;
    }

    res.status(500).json({ message: 'Внутрішня помилка сервера' });
  }
);
