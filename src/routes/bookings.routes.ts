import { Router } from 'express';
import { z } from 'zod';
import { Booking } from '../models/Booking';
import { Availability } from '../models/Availability';
import { User } from '../models/User';
import { generateAvailableSlots } from '../services/slotGenerator';
import { sendBookingNotifications } from '../services/emailService';

export const bookingsRouter = Router();

const createBookingSchema = z.object({
  userId: z.string().min(1),
  startsAt: z.string().datetime({ message: 'startsAt має бути ISO 8601 датою' }),
  clientName: z.string().min(2).max(100),
  clientEmail: z.email(),
  notes: z.string().max(1000).optional(),
});

/**
 * ПУБЛІЧНИЙ роут — клієнт бронює час без реєстрації.
 */
bookingsRouter.post('/', async (req, res) => {
  const parsed = createBookingSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid input', errors: z.treeifyError(parsed.error) });
  }

  const { userId, startsAt, clientName, clientEmail, notes } = parsed.data;
  const requestedStart = new Date(startsAt);

  const [specialist, availability] = await Promise.all([
    User.findById(userId),
    Availability.findOne({ userId }),
  ]);

  if (!specialist) {
    return res.status(404).json({ message: 'Specialist not found' });
  }

  if (!availability) {
    return res.status(404).json({ message: 'Availability not configured for this specialist' });
  }

  const dayStart = new Date(requestedStart);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const existingBookings = await Booking.find({
    userId,
    status: 'confirmed',
    startsAt: { $gte: dayStart, $lt: dayEnd },
  }).select('startsAt endsAt');

  /**
   * КЛЮЧОВА ПЕРЕВІРКА: запитаний час має ТОЧНО збігатись з одним із
   * згенерованих слотів — не просто "чи вільний цей проміжок".
   * Без цього клієнт міг би надіслати довільний startsAt (напр. 03:17
   * ночі або посеред обідньої перерви) і забронювати час поза сіткою.
   * Той самий slotGenerator, що віддає слоти клієнту — джерело правди
   * і при валідації, тому логіка гарантовано не розходиться.
   */
  const availableSlots = generateAvailableSlots({
    date: dayStart,
    availability,
    existingBookings,
  });

  const matchingSlot = availableSlots.find(
    (slot) => slot.start.getTime() === requestedStart.getTime()
  );

  if (!matchingSlot) {
    return res.status(409).json({ message: 'Обраний час недоступний для бронювання' });
  }

  try {
    const booking = await Booking.create({
      userId,
      startsAt: matchingSlot.start,
      endsAt: matchingSlot.end,
      clientName,
      clientEmail,
      notes,
    });

    // Email надсилається ПІСЛЯ успішного запису й НЕ блокує відповідь
    // помилкою — sendBookingNotifications ніколи не кидає назовні
    // (див. коментар у emailService.ts)
    void sendBookingNotifications({
      clientName,
      clientEmail,
      specialistName: specialist.name,
      specialistEmail: specialist.email,
      startsAt: matchingSlot.start,
      notes,
    });

    return res.status(201).json(booking);
  } catch (error) {
    /**
     * RACE CONDITION: між генерацією слотів вище і цим записом інший
     * клієнт міг встигнути забронювати той самий час. Unique partial-індекс
     * у моделі Booking ловить це на рівні БД (код 11000) — саме тому
     * перевірка вище НЕ є достатньою сама по собі, і цей catch обов'язковий.
     */
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
      return res.status(409).json({ message: 'Цей час щойно забронював інший клієнт' });
    }
    throw error; // решта помилок — у централізований error-handler
  }
});

/**
 * ЗАСТЕРЕЖЕННЯ: поки БЕЗ авторизації — auth.middleware на кроці 4
 * замінить :userId на req.user.id, інакше будь-хто, знаючи userId,
 * побачить чужі бронювання з персональними даними клієнтів.
 */
bookingsRouter.get('/:userId', async (req, res) => {
  const bookings = await Booking.find({ userId: req.params.userId })
    .sort({ startsAt: 1 })
    .limit(200);

  res.json(bookings);
});

bookingsRouter.patch('/:bookingId/cancel', async (req, res) => {
  const booking = await Booking.findByIdAndUpdate(
    req.params.bookingId,
    { $set: { status: 'cancelled' } },
    { new: true }
  );

  if (!booking) {
    return res.status(404).json({ message: 'Booking not found' });
  }

  res.json(booking);
});
