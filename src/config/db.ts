import mongoose from 'mongoose';

export async function connectDB(): Promise<boolean> {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error(
      '[db] MONGODB_URI не задано в .env — див. .env.example для інструкції отримання Atlas connection string'
    );
    return false;
  }

  try {
    await mongoose.connect(uri);
    console.log('[db] Підключено до MongoDB');
    return true;
  } catch (error) {
    console.error('[db] Не вдалося підключитись до MongoDB:', error);
    return false;
  }
}
