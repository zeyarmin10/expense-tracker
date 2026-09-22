import { Injectable } from '@angular/core';
import { Network } from '@capacitor/network';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class NetworkService {
  /** Physical Wi-Fi/mobile connectivity only; it intentionally ignores RTDB availability. */
  isPhysicalConnection$ = new BehaviorSubject<boolean>(true);
  /** Usable Firebase connection. A blocked RTDB route is local/offline mode. */
  isOnline$ = new BehaviorSubject<boolean>(true);
  private physicalConnection = true;
  private serverUnavailable = false;
  private initialized = false;
  private listenerAdded = false; // listener တစ်ကြိမ်တည်းသာ add ဖို့

  async init() {
    const status = await Network.getStatus();
    this.physicalConnection = status.connected;
    this.publishConnectionState();

    // listener ကို တစ်ကြိမ်တည်းသာ register လုပ်
    if (!this.listenerAdded) {
      this.listenerAdded = true;
      Network.addListener('networkStatusChange', (status) => {
        this.physicalConnection = status.connected;
        this.publishConnectionState();
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
    this.physicalConnection = status.connected;
    this.publishConnectionState();
  }

  /** The device has a network, but Firebase's backend cannot be reached
   * (for example an ISP route that requires a VPN). Treat it as offline so
   * normal writes use the durable local queue instead of hanging on RTDB. */
  markServerUnavailable(): void {
    this.serverUnavailable = true;
    this.publishConnectionState();
  }

  markServerAvailable(): void {
    this.serverUnavailable = false;
    this.publishConnectionState();
  }

  /** Lets pull-to-refresh retry Firebase after the user enables a VPN. */
  async retryServerConnection(): Promise<void> {
    this.serverUnavailable = false;
    const status = await Network.getStatus();
    this.physicalConnection = status.connected;
    this.publishConnectionState();
  }

  private publishConnectionState(): void {
    this.isPhysicalConnection$.next(this.physicalConnection);
    this.isOnline$.next(this.physicalConnection && !this.serverUnavailable);
  }
}
