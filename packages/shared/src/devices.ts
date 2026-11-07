import { z } from 'zod';

/** A paired device (SECURITY.md §3): allowed through the relay gate. */
export const DeviceInfo = z.object({
  id: z.string(),
  label: z.string(),
  createdAt: z.number().int(),
  lastSeenAt: z.number().int(),
  /** The device this request comes from. */
  current: z.boolean(),
});
export type DeviceInfo = z.infer<typeof DeviceInfo>;

export const DeviceList = z.object({ devices: z.array(DeviceInfo) });
export type DeviceList = z.infer<typeof DeviceList>;

/** GET /api/gate: whether this browser is a paired device. */
export const GateResponse = z.object({ device: z.boolean() });
export type GateResponse = z.infer<typeof GateResponse>;
