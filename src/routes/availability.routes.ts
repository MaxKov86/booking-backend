import { Router } from 'express';
import { z } from 'zod';
import { Availability } from '../models/Availability';
import { Booking } from '../models/Booking';
import { generateAvailableSlots } from '../services/slotGenerator';

export const availabilityRouter = Router();

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const workingHoursSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(TIME_PATTERN, 'Формат часу — "HH:MM"'),
  endTime: z.string().regex(TIME_PATTERN, 'Формат часу — "HH:MM"'),
});

const upsertAvailabilitySchema = z.object({
  slotDurationMinutes: z.number().int().positive(),
  bufferMinutes: z.number().int().min(0).optional(),
  minNoticeHours: z.number().min(0).optional(),
  workingHours: z.array(workingHoursSchema),
});

/**
 * ЗАСТЕРЕЖЕННЯ: :userId тут поки НЕ захищений автентифікацією —
 * auth.middleware з'явиться на кроці 4. Наразі будь-хто, хто знає
 * userId, технічно може редагувати чужий розклад. Прийнятно для
 * розробки одного роута за раз, але ОБОВ'ЯЗКОВО закрити перед реальним
 * деплоєм (замінити :userId в PUT на req.user.id з JWT-мідлвари).
 */
availabilityRouter.get('/:userId', async (req, res) => {
  const availability = await Availability.findOne({ userId: req.params.userId });

  if (!availability) {
    return res.status(404).json({ message: 'Availability not configured for this user' });
  }

  res.json(availability);
});

availabilityRouter.put('/:userId', async (req, res) => {
  const parsed = upsertAvailabilitySchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid input', errors: parsed.error.flatten() });
  }

  // upsert: true — перший виклик СТВОРЮЄ конфігурацію, наступні ОНОВЛЮЮТЬ
  // ту саму (unique-індекс на userId в моделі гарантує один документ на юзера)
  const availability = await Availability.findOneAndUpdate(
    { userId: req.params.userId },
    { $set: parsed.data },
    { new: true, upsert: true, runValidators: true }
  );

  res.json(availability);
});

const slotsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date має бути у форматі YYYY-MM-DD'),
});

/**
 * ПУБЛІЧНИЙ роут (без авторизації, навмисно) — клієнт, який ще навіть
 * не залогинений, повинен бачити доступні слоти, щоб забронювати час.
 */
availabilityRouter.get('/:userId/slots', async (req, res) => {
  const parsedQuery = slotsQuerySchema.safeParse(req.query);

  if (!parsedQuery.success) {
    return res.status(400).json({ message: 'Invalid date', errors: parsedQuery.error.flatten() });
  }

  const availability = await Availability.findOne({ userId: req.params.userId });

  if (!availability) {
    return res.status(404).json({ message: 'Availability not configured for this user' });
  }

  const targetDate = new Date(`${parsedQuery.data.date}T00:00:00.000Z`);
  const dayStart = new Date(targetDate);
  const dayEnd = new Date(targetDate);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  // Тільки 'confirmed' бронювання блокують слоти — скасовані не повинні
  // займати місце (той самий принцип, що й partial-індекс у моделі Booking)
  const existingBookings = await Booking.find({
    userId: req.params.userId,
    status: 'confirmed',
    startsAt: { $gte: dayStart, $lt: dayEnd },
  }).select('startsAt endsAt');

  const slots = generateAvailableSlots({
    date: targetDate,
    availability,
    existingBookings,
  });

  res.json(slots);
});
