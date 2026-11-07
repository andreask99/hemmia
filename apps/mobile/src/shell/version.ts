/**
 * This app's side of the version handshake with hubs (PLAN.md P5.11, packages/shared health.ts).
 *
 * - `SHELL_LEVEL`: the native capabilities of this build. Raise it in a store release that adds
 *   or changes one; hubs read it from the user agent (`HemmiaShell/<level>`, capacitor.config.ts).
 * - `MIN_HUB_BRIDGE`: the oldest hub bridge level this build can host. Raise it only when older
 *   hubs would break in this app.
 */
export const SHELL_LEVEL = 1;
export const MIN_HUB_BRIDGE = 1;
