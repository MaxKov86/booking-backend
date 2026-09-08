import 'dotenv/config';
import { app } from './app';
import { connectDB } from './config/db';

const PORT = process.env.PORT ?? 4000;

async function bootstrap() {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`[server] Запущено на http://localhost:${PORT}`);
  });
}

bootstrap();
