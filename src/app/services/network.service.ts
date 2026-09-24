import { Injectable } from '@angular/core';
import { Network } from '@capacitor/network';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class NetworkService {
  /** Physical Wi-Fi/mobile connectivity only. */
  isPhysicalConnection$ = new BehaviorSubject<boolean>(false);
  /** True only after a native reachability probe proves the app can reach its backend. */
  hasInternetAccess$ = new BehaviorSubject<boolean>(false);
  /** The first probe has completed, so UI may safely show an offline/online notice. */
  hasCheckedInternetAccess$ = new BehaviorSubject<boolean>(false);
  /** Usable Firebase connection. Unknown, blocked, or unreachable means local/offline mode. */
  isOnline$ = new BehaviorSubject<boolean>(false);
  private physicalConnection = false;
  private internetReachable = false;
  private serverUnavailable = false;
  private initialized = false;
  private listenerAdded = false; // listener တစ်ကြိမ်တည်းသာ add ဖို့
  private reachabilityCheckId = 0;
  private readonly reachabilityTimeoutMs = 2500;

  async init() {
    const status = await Network.getStatus().catch(() => ({ connected: false }));
    this.physicalConnection = status.connected;
    this.publishConnectionState();

    // listener ကို တစ်ကြိမ်တည်းသာ register လုပ်
    if (!this.listenerAdded) {
      this.listenerAdded = true;
      Network.addListener('networkStatusChange', (status) => {
        this.physicalConnection = status.connected;
        if (!status.connected) {
          this.internetReachable = false;
          this.hasCheckedInternetAccess$.next(true);
          this.publishConnectionState();
          return;
        }

        // A connected Wi-Fi/mobile bearer can still be captive or internet-less.
        // Stay offline until the native probe proves backend reachability.
        this.internetReachable = false;
        this.publishConnectionState();
        void this.refreshInternetAccess();
      });
    }

    this.initialized = true;
    void this.refreshInternetAccess();
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
    const status = await Network.getStatus().catch(() => ({ connected: false }));
    this.physicalConnection = status.connected;
    if (!status.connected) {
      this.internetReachable = false;
      this.hasCheckedInternetAccess$.next(true);
      this.publishConnectionState();
      return;
    }
    await this.refreshInternetAccess();
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
    this.internetReachable = true;
    this.hasCheckedInternetAccess$.next(true);
    this.publishConnectionState();
  }

  /** Lets pull-to-refresh retry Firebase after the user enables a VPN. */
  async retryServerConnection(): Promise<void> {
    this.serverUnavailable = false;
    const status = await Network.getStatus().catch(() => ({ connected: false }));
    this.physicalConnection = status.connected;
    this.publishConnectionState();
    await this.refreshInternetAccess();
  }

  async refreshInternetAccess(): Promise<boolean> {
    const checkId = ++this.reachabilityCheckId;

    if (!this.physicalConnection) {
      this.internetReachable = false;
      this.hasCheckedInternetAccess$.next(true);
      this.publishConnectionState();
      return false;
    }

    const reachable = await this.probeBackendReachability();
    if (checkId !== this.reachabilityCheckId) {
      return this.internetReachable;
    }

    this.internetReachable = reachable;
    this.hasCheckedInternetAccess$.next(true);
    if (reachable) {
      this.serverUnavailable = false;
    }
    this.publishConnectionState();
    return reachable;
  }

  private async probeBackendReachability(): Promise<boolean> {
    const databaseUrl = environment.firebaseConfig.databaseURL.replace(/\/$/, '');
    const url = `${databaseUrl}/.json?shallow=true&kw_probe=${Date.now()}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.reachabilityTimeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache',
        },
      });
      return response.status >= 200 && response.status < 500;
    } catch {
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private publishConnectionState(): void {
    this.isPhysicalConnection$.next(this.physicalConnection);
    this.hasInternetAccess$.next(this.internetReachable);
    this.isOnline$.next(this.internetReachable && !this.serverUnavailable);
  }
}
