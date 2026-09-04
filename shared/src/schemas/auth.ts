import { z } from 'zod';
import { dateString } from './common.js';

export const credentials = z.object({
  username: z.string().trim().min(3, 'Минимум 3 символа').max(64),
  password: z.string().min(8, 'Минимум 8 символов').max(200),
});
export type Credentials = z.infer<typeof credentials>;

export const authState = z.object({
  authenticated: z.boolean(),
  /** True while no user exists — the client shows the first-run setup screen. */
  needsSetup: z.boolean(),
  username: z.string().nullable(),
  /**
   * Today in the server's time zone. The server owns the journal, so its
   * calendar day is the authoritative one: a browser in another zone would
   * otherwise show the neighbouring day and offer to fill in an open one.
   */
  serverDate: dateString,
  timezone: z.string(),
});
export type AuthState = z.infer<typeof authState>;

export const changePassword = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Минимум 8 символов').max(200),
});
export type ChangePassword = z.infer<typeof changePassword>;
