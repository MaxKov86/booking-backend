# Booking Backend

Express + TypeScript + MongoDB (Mongoose) бекенд для booking-системи (Calendly-lite). Окремий репозиторій від фронтенду — навмисно, показує вміння розділяти проекти без monorepo-тулінгу.

## Запуск

```bash
npm install
cp .env.example .env
```

Заповни `.env`:
- `MONGODB_URI` — інструкція отримання прямо в `.env.example`
- `JWT_SECRET` — будь-який довгий випадковий рядок

```bash
npm run dev
```

Сервер стартує на `http://localhost:4000` навіть без валідного `MONGODB_URI` — просто залогує зрозумілу помилку (зручно для розробки, поки Atlas ще не налаштований).

## Прогрес по кроках ТЗ

- [x] **Крок 1:** Налаштування Express + MongoDB (Mongoose), базові моделі (`User`, `Availability`, `Booking`), підключення
- [ ] Крок 2: `Availability` CRUD + `slotGenerator` — ядро бізнес-логіки
- [ ] Крок 3: `Booking` create з перевіркою конфліктів, email-нотифікації
- [ ] Крок 4: JWT auth (реєстрація/логін адміна, middleware захисту)
- [ ] Крок 5-7: Frontend (окремий репозиторій `booking-frontend`)

## Ключові рішення

- **`bcryptjs`, не `bcrypt`** — чиста JS-реалізація без нативної компіляції (`node-gyp`), менше проблем із встановленням на різних машинах/CI
- **`startsAt`/`endsAt` як `Date`, не рядки `"date"`/`"time"`** — MongoDB зберігає `Date` в UTC внутрішньо; конвертація під локальну таймзону користувача відбувається на фронтенді при відображенні, а не тут
- **Unique partial-індекс на `Booking`** (`{ userId, startsAt }`, лише для `status: 'confirmed'`) — головний захист від подвійного бронювання. Перевірка "прочитати вільні слоти, потім записати" в коді вразлива до race condition; індекс на рівні БД гарантує, що другий одночасний запис впаде з помилкою дубліката незалежно від таймінгу запитів
- **`connectDB()` не кидає процес** при невдалому підключенні — логує й повертає `false`. У продакшн-режимі це можна змінити на `process.exit(1)`, але для локальної розробки без готового Atlas зручніше бачити зрозумілу помилку, ніж незрозумілий crash

## Структура

```
src/
  models/       # User, Availability, Booking (Mongoose-схеми)
  routes/       # (з'являться крок 2+)
  services/     # slotGenerator, emailService (крок 2-3)
  middleware/   # auth, validate (крок 4)
  config/       # db.ts — підключення MongoDB
  app.ts        # Express застосунок (CORS, JSON, роути)
  server.ts     # точка входу
```
