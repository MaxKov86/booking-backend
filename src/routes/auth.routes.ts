import { Router } from 'express';
import { z } from 'zod';
import { User } from '../models/User';
import {
  hashPassword,
  verifyPassword,
  generateTokens,
  verifyRefreshToken,
} from '../services/authService';
import { requireAuth } from '../middleware/auth.middleware';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(8, 'Пароль має бути щонайменше 8 символів'),
  name: z.string().min(2).max(100),
  slug: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug може містити лише малі літери, цифри та дефіси'),
});

authRouter.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid input', errors: z.treeifyError(parsed.error) });
  }

  const { email, password, name, slug } = parsed.data;

  // Перевіряємо ОБИДВА унікальні поля одразу — інакше користувач,
  // у якого зайнятий лише slug, отримав би незрозумілу помилку
  // дублікату замість конкретного пояснення
  const existing = await User.findOne({ $or: [{ email }, { slug }] });

  if (existing) {
    const field = existing.email === email ? 'email' : 'slug';
    return res.status(409).json({ message: `Такий ${field} вже зайнятий` });
  }

  const user = await User.create({
    email,
    passwordHash: await hashPassword(password),
    name,
    slug,
  });

  const tokens = generateTokens({ userId: user._id.toString() });

  // passwordHash навмисно НЕ повертаємо — навіть хеш не варто віддавати клієнту
  return res.status(201).json({
    user: { id: user._id, email: user.email, name: user.name, slug: user.slug },
    ...tokens,
  });
});

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid input' });
  }

  const user = await User.findOne({ email: parsed.data.email });

  // Однакова відповідь і для "юзера нема", і для "пароль невірний" —
  // навмисно, щоб не давати можливості перебором з'ясувати, які email
  // зареєстровані в системі (user enumeration)
  const isValid = user && (await verifyPassword(parsed.data.password, user.passwordHash));

  if (!isValid) {
    return res.status(401).json({ message: 'Невірний email або пароль' });
  }

  const tokens = generateTokens({ userId: user._id.toString() });

  return res.json({
    user: { id: user._id, email: user.email, name: user.name, slug: user.slug },
    ...tokens,
  });
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

authRouter.post('/refresh', async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: 'refreshToken обов\'язковий' });
  }

  try {
    const payload = verifyRefreshToken(parsed.data.refreshToken);

    // Перевіряємо, що юзер ще існує — токен міг лишитись валідним
    // після видалення акаунта
    const user = await User.findById(payload.userId);
    if (!user) {
      return res.status(401).json({ message: 'Користувача не знайдено' });
    }

    return res.json(generateTokens({ userId: payload.userId }));
  } catch {
    return res.status(401).json({ message: 'Невалідний або прострочений refresh-токен' });
  }
});

/** Хто я — зручно для фронтенду, щоб відновити сесію після перезавантаження */
authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.user!.userId);

  if (!user) {
    return res.status(404).json({ message: 'Користувача не знайдено' });
  }

  return res.json({ id: user._id, email: user.email, name: user.name, slug: user.slug });
});
