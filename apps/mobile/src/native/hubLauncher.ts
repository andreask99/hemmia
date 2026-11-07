/** The app's own native plugin (ios/App/App/HubLauncherPlugin.swift, android …/HubLauncherPlugin.java). */
import { registerPlugin } from '@capacitor/core';

export interface LaunchInfo {
  /** Why the shell is showing: app start, the hub's "Switch kchat", the hub failed to load, or
   *  a join link arrived while a hub was running. */
  reason: 'start' | 'switch' | 'offline' | 'link' | 'push';
  /** The hub the app came from (switch, offline). */
  hubHost: string | null;
  /** The join link for reason 'link' (given out once). */
  link: string | null;
  /** A tapped notification for a hub other than the one that was running (reason 'push'). */
  push: { hubHost: string; ref: string } | null;
}

export interface HubLauncher {
  /** Restarts the app on a saved hub; `path` is '/', or '/join#<kind>~<code>'. Shell only. */
  open: (o: { hubHost: string; path: string }) => Promise<void>;
  showShell: (o?: { push?: { hubHost: string; ref: string } }) => Promise<void>;
  setSensitive: (o: { on: boolean }) => Promise<void>;
  /** Shell only: holds the export for that hub; open `/import#phone~<token>` there next. */
  stagePhoneExport: (o: { hubHost: string; json: string }) => Promise<{ token: string }>;
  launchInfo: () => Promise<LaunchInfo>;
}

export const hubLauncher = registerPlugin<HubLauncher>('HubLauncher');
