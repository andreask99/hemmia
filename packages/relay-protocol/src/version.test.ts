import { describe, expect, it } from 'vitest';
import { compareVersions, hubAgent, hubAgentVersion, hubVersionAllowed } from './version.ts';

describe('hub versions', () => {
  it('puts the version into the agent and reads it back', () => {
    expect(hubAgent('0.1.0')).toBe('hemmia-hub/0.1.0');
    expect(hubAgentVersion('hemmia-hub/0.1.0')).toBe('0.1.0');
    expect(hubAgent('not-a-version')).toBe('hemmia-hub');
    expect(hubAgentVersion('hemmia-hub')).toBeNull();
    expect(hubAgentVersion('hemmia-hub/1.2')).toBeNull();
    expect(hubAgentVersion('other/1.2.3')).toBeNull();
  });

  it('compares numerically, not as text', () => {
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.1', '1.1.0')).toBeLessThan(0);
  });

  it('allows everything without a minimum, and refuses older or unversioned hubs under one', () => {
    expect(hubVersionAllowed('hemmia-hub', null)).toBe(true);
    expect(hubVersionAllowed('hemmia-hub/0.2.0', '0.2.0')).toBe(true);
    expect(hubVersionAllowed('hemmia-hub/0.3.1', '0.2.0')).toBe(true);
    expect(hubVersionAllowed('hemmia-hub/0.1.9', '0.2.0')).toBe(false);
    expect(hubVersionAllowed('hemmia-hub', '0.2.0')).toBe(false);
  });
});
