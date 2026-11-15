import mongoose, { Schema, type Model, Types } from "mongoose";

export const TOKEN_STATUSES = ["waiting", "serving", "served", "cancelled", "no_show"] as const;
export type TokenStatus = (typeof TOKEN_STATUSES)[number];

export const EVENT_TYPES = [
  "created",
  "moved",
  "called",
  "recalled",
  "served",
  "no_show",
  "cancelled",
  "restored",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

const userSchema = new Schema<UserDoc>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const queueSchema = new Schema<QueueDoc>(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    prefix: { type: String, required: true, uppercase: true, trim: true, maxlength: 3 },
    counters: { type: Number, default: 1, min: 1, max: 10 },
    /** Next token number to issue. Restarts at 1 each day, like a paper token roll. */
    nextNumber: { type: Number, default: 1 },
    /** Local day (YYYY-MM-DD) that nextNumber belongs to. */
    numberDay: { type: String, default: "" },
  },
  { timestamps: true },
);

const tokenSchema = new Schema<TokenDoc>(
  {
    queue: { type: Schema.Types.ObjectId, ref: "Queue", required: true },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    number: { type: Number, required: true },
    code: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, trim: true, maxlength: 20 },
    note: { type: String, trim: true, maxlength: 140 },
    priority: { type: Boolean, default: false },
    status: { type: String, enum: TOKEN_STATUSES, default: "waiting" },
    /** Sort key among waiting tokens (fractional indexing; lower = earlier). */
    position: { type: Number, required: true },
    counter: { type: Number },
    /** Unguessable key for the public customer tracking page. */
    publicKey: { type: String, required: true, unique: true },
    createdAt: { type: Date, required: true },
    calledAt: { type: Date },
    completedAt: { type: Date },
    cancelledAt: { type: Date },
  },
  { timestamps: { createdAt: false, updatedAt: true } },
);
tokenSchema.index({ queue: 1, status: 1, position: 1 });
tokenSchema.index({ owner: 1, createdAt: 1 });
tokenSchema.index({ queue: 1, createdAt: -1 });

const eventSchema = new Schema<EventDoc>({
  owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
  queue: { type: Schema.Types.ObjectId, ref: "Queue", required: true },
  token: { type: Schema.Types.ObjectId, ref: "Token" },
  code: { type: String },
  type: { type: String, enum: EVENT_TYPES, required: true },
  counter: { type: Number },
  at: { type: Date, default: () => new Date() },
});
eventSchema.index({ queue: 1, at: -1 });

export interface UserDoc {
  _id: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  isDemo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface QueueDoc {
  _id: Types.ObjectId;
  owner: Types.ObjectId;
  name: string;
  prefix: string;
  counters: number;
  nextNumber: number;
  numberDay: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TokenDoc {
  _id: Types.ObjectId;
  queue: Types.ObjectId;
  owner: Types.ObjectId;
  number: number;
  code: string;
  name: string;
  phone?: string | null;
  note?: string | null;
  priority: boolean;
  status: TokenStatus;
  position: number;
  counter?: number | null;
  publicKey: string;
  createdAt: Date;
  calledAt?: Date | null;
  completedAt?: Date | null;
  cancelledAt?: Date | null;
  updatedAt?: Date;
}

export interface EventDoc {
  _id: Types.ObjectId;
  owner: Types.ObjectId;
  queue: Types.ObjectId;
  token?: Types.ObjectId | null;
  code?: string | null;
  type: EventType;
  counter?: number | null;
  at: Date;
}

function model<T>(name: string, schema: Schema<T>): Model<T> {
  return (mongoose.models[name] as Model<T>) ?? mongoose.model<T>(name, schema);
}

export const User = model<UserDoc>("User", userSchema);
export const Queue = model<QueueDoc>("Queue", queueSchema);
export const Token = model<TokenDoc>("Token", tokenSchema);
export const QueueEvent = model<EventDoc>("Event", eventSchema);
