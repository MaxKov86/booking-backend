import { Schema, model, type InferSchemaType } from 'mongoose';

const bookingSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    clientName: { type: String, required: true, trim: true },
    clientEmail: { type: String, required: true, trim: true, lowercase: true },
    notes: { type: String, trim: true },
    status: { type: String, enum: ['confirmed', 'cancelled'], default: 'confirmed' },
  },
  { timestamps: true }
);

bookingSchema.index(
  { userId: 1, startsAt: 1 },
  { unique: true, partialFilterExpression: { status: 'confirmed' } }
);

export type BookingDocument = InferSchemaType<typeof bookingSchema>;
export const Booking = model('Booking', bookingSchema);
