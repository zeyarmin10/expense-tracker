import { Injectable } from '@angular/core';
import { Network } from '@capacitor/network';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class NetworkService {
  isOnline$ = new BehaviorSubject<boolean>(true);
  private initialized = false;
  private listenerAdded = false; // listener တစ်ကြိမ်တည်းသာ add ဖို့

  async init() {
    const status = await Network.getStatus();
    this.isOnline$.next(status.connected);

    // listener ကို တစ်ကြိမ်တည်းသာ register လုပ်
    if (!this.listenerAdded) {
      this.listenerAdded = true;
      Network.addListener('networkStatusChange', (status) => {
        this.isOnline$.next(status.connected);
      });
    }

    this.initialized = true;
  }

  // foreground ပြန်လာတိုင်း current status စစ်ပြီး emit လုပ်တယ်
  //
  // Some devices report a stale/transient "disconnected" status for a
  // moment right as the app returns to the foreground — e.g. coming back
  // from the native camera app after a voucher photo — because the
  // WiFi/mobile radio is still waking up, not because connectivity
  // actually changed. Sampling immediately made that brief blip show up
  // as a real drop, triggering a "No internet" alert immediately followed
  // by "Internet restored". Give the radio a moment to settle first.
  async checkOnResume() {
    await new Promise(resolve => setTimeout(resolve, 800));
    const status = await Network.getStatus();
    this.isOnline$.next(status.connected);
  }
}