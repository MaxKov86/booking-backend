import 'dotenv/config';
import { app } from './app';
import { connectDB } from './config/db';

const PORT = Number(process.env.PORT ?? 4000);

/**
 * '0.0.0.0', а не дефолтний localhost — критично для контейнерних
 * хостингів (Render, Railway, Fly.io). Всередині контейнера localhost
 * означає "лише цей контейнер", і платформа не змогла б достукатись
 * до сервісу ззовні — деплой би "піднявся", але health-check провалився.
 *
 * PORT платформа задає САМА через змінну середовища — не хардкодимо.
 */
const HOST = '0.0.0.0';

async function bootstrap() {
  const isConnected = await connectDB();

  // У продакшні падаємо, якщо БД недоступна — сервіс без бази марний,
  // краще щоб платформа побачила невдалий старт і показала помилку,
  // ніж "здоровий" сервіс, який відповідає 500 на кожен запит.
  // Локально (dev) — навпаки, зручніше підняти сервер і бачити причину.
  if (!isConnected && process.env.NODE_ENV === 'production') {
    console.error('[server] Не вдалося підключитись до БД — зупиняю процес');
    process.exit(1);
  }

  app.listen(PORT, HOST, () => {
    console.log(`[server] Запущено на порту ${PORT}`);
  });
}

bootstrap();
