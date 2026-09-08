import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

interface BookingEmailData {
  clientName: string;
  clientEmail: string;
  specialistName: string;
  specialistEmail: string;
  startsAt: Date;
  notes?: string | null;
}

let transporter: Transporter | null = null;

/**
 * Транспорт створюється ЛЕДАЧО (при першому реальному надсиланні), а не
 * при старті модуля — інакше сервер не піднявся б без налаштованого SMTP,
 * хоча email це допоміжна, а не критична функція.
 *
 * Для розробки рекомендую Ethereal (https://ethereal.email) або Mailtrap:
 * обидва дають фейковий SMTP, який ЛОВИТЬ листи замість реального
 * надсилання — зручно перевіряти вміст, не спамлячи справжні адреси.
 */
function getTransporter(): Transporter | null {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT ?? 587),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  return transporter;
}

const dateFormatter = new Intl.DateTimeFormat('uk-UA', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'UTC',
});

/**
 * КЛЮЧОВЕ РІШЕННЯ: ця функція НІКОЛИ не кидає помилку назовні.
 * Бронювання вже успішно записане в БД на момент виклику — якщо SMTP
 * недоступний чи не налаштований, це не привід відкочувати бронювання
 * чи показувати клієнту помилку. Логуємо й рухаємось далі.
 *
 * У реальному продакшні тут була б черга (BullMQ/SQS) з ретраями,
 * а не "надіслати й забути" — але для pet-проекту це надлишкова складність.
 */
export async function sendBookingNotifications(data: BookingEmailData): Promise<void> {
  const mailer = getTransporter();

  if (!mailer) {
    console.warn(
      '[email] SMTP не налаштовано (SMTP_HOST/USER/PASS у .env) — пропускаю надсилання листів'
    );
    return;
  }

  const when = dateFormatter.format(data.startsAt);
  const from = process.env.SMTP_FROM ?? data.specialistEmail;

  try {
    await Promise.all([
      // Клієнту — підтвердження
      mailer.sendMail({
        from,
        to: data.clientEmail,
        subject: `Бронювання підтверджено — ${when}`,
        text: [
          `Вітаємо, ${data.clientName}!`,
          '',
          `Ваше бронювання підтверджено на ${when} (UTC).`,
          `Спеціаліст: ${data.specialistName}`,
          data.notes ? `\nВаш коментар: ${data.notes}` : '',
        ].join('\n'),
      }),

      // Спеціалісту — сповіщення про новий запис
      mailer.sendMail({
        from,
        to: data.specialistEmail,
        subject: `Нове бронювання — ${when}`,
        text: [
          `Новий запис на ${when} (UTC).`,
          '',
          `Клієнт: ${data.clientName}`,
          `Email: ${data.clientEmail}`,
          data.notes ? `Коментар: ${data.notes}` : '',
        ].join('\n'),
      }),
    ]);

    console.log('[email] Листи надіслано');
  } catch (error) {
    console.error('[email] Не вдалося надіслати листи:', error);
  }
}
