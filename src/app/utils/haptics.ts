import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

/**
 * A very light "tick" for when a sheet or overlay is swiped closed.
 *
 * On Android, Capacitor's `impact()` runs the vibration motor for 50ms (and
 * `selectionChanged()` for 100ms), which feels like the heavy buzz of an old
 * hardware back key. A ~12ms one-shot is just a tick. On iOS `vibrate()` is a
 * long system buzz, so iOS keeps `impact(Light)`, which there is already a
 * light Taptic tap. Does nothing on the web.
 */
export function swipeCloseHaptic(): void {
  if (!Capacitor.isNativePlatform()) return;
  const done = Capacitor.getPlatform() === 'android'
    ? Haptics.vibrate({ duration: 12 })
    : Haptics.impact({ style: ImpactStyle.Light });
  done.catch(() => undefined);
}
