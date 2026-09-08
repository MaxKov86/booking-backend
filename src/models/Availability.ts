import { Schema, model, type InferSchemaType } from 'mongoose';

const workingHoursSchema = new Schema(
  {
    dayOfWeek: { type: Number, min: 0, max: 6, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
  },
  { _id: false }
);

const availabilitySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    slotDurationMinutes: { type: Number, required: true, default: 30 },
    bufferMinutes: { type: Number, default: 0 },
    minNoticeHours: { type: Number, default: 2 },
    workingHours: { type: [workingHoursSchema], default: [] },
  },
  { timestamps: true }
);

export type AvailabilityDocument = InferSchemaType<typeof availabilitySchema>;
export const Availability = model('Availability', availabilitySchema);
