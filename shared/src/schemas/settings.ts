import { z } from 'zod';

export const themes = ['system', 'light', 'dark'] as const;
export const theme = z.enum(themes);
export type Theme = z.infer<typeof theme>;

/*
 * There are no daily targets here: the target for a day is whatever the plan
 * holds for that weekday. It is derived from the plan rather than set as a
 * separate number — two sources of truth inevitably drift apart.
 */
export const settings = z.object({
  waterTargetMl: z.number().int().min(500).max(8000),
  /** 1 = the week starts on Monday, 0 = on Sunday. */
  weekStart: z.union([z.literal(0), z.literal(1)]),
  theme,
});
export type Settings = z.infer<typeof settings>;

export const settingsPatch = settings.partial();
export type SettingsPatch = z.infer<typeof settingsPatch>;

export const defaultSettings: Settings = {
  waterTargetMl: 2500,
  weekStart: 1,
  theme: 'system',
};
