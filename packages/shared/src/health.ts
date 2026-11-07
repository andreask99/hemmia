import { z } from 'zod';

/**
 * Version handshake between the phone app's shell and a hub (PLAN.md P5.11). The shell has a
 * native level (`SHELL_LEVEL` in apps/mobile), raised in a store release that adds or changes a
 * native capability; the hub's web app has a bridge level, raised when it starts calling one.
 *
 * - `HUB_BRIDGE_LEVEL`: what this hub's web app expects of the bridge.
 * - `MIN_SHELL_LEVEL`: the oldest shell this hub's web app still works with. Raise it only when
 *   older apps would break; features that need a newer shell check `native.level` instead.
 */
export const HUB_BRIDGE_LEVEL = 1;
export const MIN_SHELL_LEVEL = 1;

/**
 * Public and unauthenticated: no hub version (it would point attackers at outdated hubs; admins
 * see it in Settings → System).
 */
export const HealthResponse = z.object({
  status: z.literal('ok'),
  bridge: z.number().int().min(0),
  minShell: z.number().int().min(0),
});
export type HealthResponse = z.infer<typeof HealthResponse>;
