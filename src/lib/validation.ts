import { z } from "zod";

const trimmed = (max: number, label: string) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} must be at most ${max} characters`);

export const registerSchema = z.object({
  name: trimmed(80, "Name"),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export const queueSchema = z.object({
  name: trimmed(60, "Queue name"),
  prefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{1,3}$/, "Prefix must be 1–3 letters"),
  counters: z.coerce.number().int().min(1, "At least 1 counter").max(10, "At most 10 counters"),
});

export const queueUpdateSchema = queueSchema.partial().refine((v) => Object.keys(v).length > 0, "Nothing to update");

export const tokenSchema = z.object({
  name: trimmed(80, "Name"),
  phone: z
    .string()
    .trim()
    .max(20)
    .regex(/^[+\d][\d\s-]{5,19}$/, "Enter a valid phone number")
    .optional()
    .or(z.literal("")),
  note: z.string().trim().max(140).optional(),
  priority: z.boolean().optional(),
});

export const callNextSchema = z.object({ counter: z.number().int().min(1).max(10).default(1) });

export const tokenPatchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("move"), direction: z.enum(["up", "down"]) }),
  z.object({ action: z.literal("reorder"), beforeId: z.string().nullable() }),
  z.object({ action: z.enum(["complete", "no_show", "cancel", "restore", "recall"]) }),
]);
