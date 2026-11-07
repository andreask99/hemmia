/**
 * Marks sockets that arrived through the relay tunnel (RELAY.md §4.7), so the device gate
 * (SECURITY.md §3) can tell them from Tailscale and local requests. Owned by Claude.
 */
const viaRelay = new WeakSet<object>();

export function markViaRelay(socket: object): void {
  viaRelay.add(socket);
}

export function isViaRelay(socket: object | null | undefined): boolean {
  return socket !== null && socket !== undefined && viaRelay.has(socket);
}
