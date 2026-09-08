import express from 'express';
import cors from 'cors';
import { availabilityRouter } from './routes/availability.routes';
import { bookingsRouter } from './routes/bookings.routes';

export const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  })
);
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/availability', availabilityRouter);
app.use('/api/bookings', bookingsRouter);

// Роут auth підключиться тут на кроці 4

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

    // Mongoose duplicate key (напр. подвійне бронювання того самого
    // слоту — унікальний індекс у моделі Booking) — код 11000
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === 11000) {
      res.status(409).json({ message: 'Цей запис конфліктує з уже існуючим' });
      return;
    }

    res.status(500).json({ message: 'Внутрішня помилка сервера' });
  }
);
