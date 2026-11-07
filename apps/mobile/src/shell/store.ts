/** The app's hub store, on Capacitor Preferences with this build's host rules. */
import { Preferences } from '@capacitor/preferences';
import { createHubStore } from './hubs.ts';

export const hostRules = { relayDomain: __RELAY_DOMAIN__, devHosts: __DEV_HOSTS__ };
export const hubStore = createHubStore(Preferences, hostRules);
