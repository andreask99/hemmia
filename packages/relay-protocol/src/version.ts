/**
 * Hub versions on the tunnel (P2.17): the hub's AUTH `agent` is `hemmia-hub/<x.y.z>`, and the
 * relay refuses Connect below its minimum. Owned by Claude.
 */

const SEMVER = /^(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/;
const AGENT = /^hemmia-hub\/(\d{1,4}\.\d{1,4}\.\d{1,4})$/;

export function isVersion(v: string): boolean {
  return SEMVER.test(v);
}

/** The AUTH agent for a hub version. */
export function hubAgent(version: string): string {
  return isVersion(version) ? `hemmia-hub/${version}` : 'hemmia-hub';
}

/** The version in a hub's agent, or null (older hubs sent only "hemmia-hub"). */
export function hubAgentVersion(agent: string): string | null {
  return AGENT.exec(agent)?.[1] ?? null;
}

/** Negative, zero or positive as a is below, equal to or above b (both x.y.z). */
export function compareVersions(a: string, b: string): number {
  const pa = SEMVER.exec(a);
  const pb = SEMVER.exec(b);
  if (!pa || !pb) throw new Error('not a version');
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i]);
    if (d !== 0) return d;
  }
  return 0;
}

/** Whether a hub with this agent may connect under `minimum` (null: no minimum). */
export function hubVersionAllowed(agent: string, minimum: string | null): boolean {
  if (minimum === null) return true;
  const v = hubAgentVersion(agent);
  return v !== null && compareVersions(v, minimum) >= 0;
}
