interface WorkingHoursWindow {
  dayOfWeek: number; // 0 = неділя, 6 = субота
  startTime: string; // "09:00"
  endTime: string; // "17:00"
}

interface AvailabilityConfig {
  slotDurationMinutes: number;
  bufferMinutes?: number | null;
  minNoticeHours?: number | null;
  workingHours: WorkingHoursWindow[];
}

interface ExistingBooking {
  startsAt: Date;
  endsAt: Date;
}

export interface TimeSlot {
  start: Date;
  end: Date;
}

interface GenerateSlotsParams {
  /** Конкретний день, для якого генеруємо слоти (час у полі не важливий, береться лише дата) */
  date: Date;
  availability: AvailabilityConfig;
  existingBookings: ExistingBooking[];
  /** Параметр для тестованості — за замовчуванням "зараз", але тест може підставити фіксований момент */
  now?: Date;
}

/**
 * Чиста функція — не звертається до БД і нічого не знає про Express.
 * Приймає вже завантажені дані (Availability-конфіг + масив існуючих
 * бронювань на цей день) і повертає масив вільних слотів.
 *
 * СПРОЩЕННЯ (задокументоване, не прихована помилка): dayOfWeek/startTime/
 * endTime трактуються як UTC напряму, без конвертації під часову зону
 * спеціаліста. Повноцінна підтримка часових зон — опційна "level up"
 * фіча з ТЗ, свідомо відкладена; для MVP цього достатньо.
 */
export function generateAvailableSlots({
  date,
  availability,
  existingBookings,
  now = new Date(),
}: GenerateSlotsParams): TimeSlot[] {
  const dayOfWeek = date.getUTCDay();
  const daySchedule = availability.workingHours.filter((wh) => wh.dayOfWeek === dayOfWeek);

  if (daySchedule.length === 0) {
    return [];
  }

  const slotMs = availability.slotDurationMinutes * 60_000;
  const bufferMs = (availability.bufferMinutes ?? 0) * 60_000;
  const minNoticeMs = (availability.minNoticeHours ?? 0) * 60 * 60_000;
  const earliestAllowed = new Date(now.getTime() + minNoticeMs);

  const slots: TimeSlot[] = [];

  for (const window of daySchedule) {
    const windowStart = combineDateWithTime(date, window.startTime);
    const windowEnd = combineDateWithTime(date, window.endTime);

    let cursor = windowStart.getTime();

    // Наступний слот вміщається, лише якщо він ПОВНІСТЮ влазить до кінця
    // робочого вікна — інакше клієнт міг би забронювати "півслоту"
    while (cursor + slotMs <= windowEnd.getTime()) {
      const slotStart = new Date(cursor);
      const slotEnd = new Date(cursor + slotMs);

      const respectsMinNotice = slotStart.getTime() >= earliestAllowed.getTime();
      const overlapsExisting = existingBookings.some(
        (booking) =>
          slotStart.getTime() < booking.endsAt.getTime() &&
          slotEnd.getTime() > booking.startsAt.getTime()
      );

      if (respectsMinNotice && !overlapsExisting) {
        slots.push({ start: slotStart, end: slotEnd });
      }

      // Буфер додається ПІСЛЯ кожного слоту (не тільки після зайнятих) —
      // так проміжок між сусідніми зустрічами гарантовано витримується
      // незалежно від того, чи попередній слот хтось забронював
      cursor += slotMs + bufferMs;
    }
  }

  return slots;
}

/** Бере дату з `date` (рік/місяць/день) і час з рядка "HH:MM", повертає новий Date в UTC */
function combineDateWithTime(date: Date, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const result = new Date(date);
  result.setUTCHours(hours, minutes, 0, 0);
  return result;
}
