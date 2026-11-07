/** Picks the sender per platform: APNs for iOS, FCM for Android (each optional). */
import type { PushSender } from './sender.ts';

export function routeSenders(o: {
  ios: PushSender | null;
  android: PushSender | null;
}): PushSender | null {
  if (!o.ios && !o.android) return null;
  return {
    send(platform, env, token, message) {
      const s = platform === 'ios' ? o.ios : o.android;
      return s ? s.send(platform, env, token, message) : Promise.resolve('error');
    },
  };
}
