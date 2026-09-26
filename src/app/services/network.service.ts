import { Injectable, inject } from '@angular/core';
import { Database, goOnline, onValue, ref } from '@angular/fire/database';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class NetworkService {
  private db = inject(Database);
  /** Native physical status; web follows the Firebase connection. */
  isPhysicalConnection$ = new BehaviorSubject<boolean>(false);
  /** Native reachability result; on web this follows Firebase's live connection. */
  hasInternetAccess$ = new BehaviorSubject<boolean>(false);
  /** The first connection check has completed. */
  hasCheckedInternetAccess$ = new BehaviorSubject<boolean>(false);
  /** Web follows Firebase's live connection; native also checks reachability. */
  isOnline$ = new BehaviorSubject<boolean>(false);
  private physicalConnection = false;
  private internetReachable = false;
  private serverUnavailable = false;
  private firebaseListenerAdded = false;
  private initialized = false;
  private listenerAdded = false; // listener တစ်ကြိမ်တည်းသာ add ဖို့
  private probeTimer?: ReturnType<typeof setInterval>;
  private reachabilityCheckId = 0;
  private physicalStatusCheckId = 0;
  private readonly reachabilityTimeoutMs = Capacitor.isNativePlatform() ? 3500 : 6000;
  private readonly reachabilityRetryDelayMs = 650;
  private readonly disconnectConfirmDelayMs = Capacitor.isNativePlatform() ? 2200 : 0;

  async init() {
    if (!Capacitor.isNativePlatform()) {
      if (!this.firebaseListenerAdded) {
        this.firebaseListenerAdded = true;
        onValue(ref(this.db, '.info/connected'), snapshot => {
          this.updateWebConnection(snapshot.val() === true);
        }, () => {
          this.updateWebConnection(false);
        });
      }
      return;
    }
    this.physicalConnection = await this.getConfirmedPhysicalConnectionStatus();
    this.publishConnectionState();

    // listener ကို တစ်ကြိမ်တည်းသာ register လုပ်
    if (!this.listenerAdded) {
      this.listenerAdded = true;
      Network.addListener('networkStatusChange', (status) => {
        if (!status.connected) {
          const checkId = ++this.physicalStatusCheckId;
          void this.confirmPhysicalDisconnect(checkId);
          return;
        }

        ++this.physicalStatusCheckId;
        this.physicalConnection = true;
        // A connected Wi-Fi/mobile bearer can still be captive or internet-less.
        // Keep the previous usable state while the reachability probe runs so
        // a slow mobile reload/viewport change does not flash a false offline
        // toast before Firebase has a chance to answer.
        void this.refreshInternetAccess();
      });
    }

    this.initialized = true;
    void this.refreshInternetAccess();
    // A VPN/backend route can recover without a Wi-Fi status change.
    this.probeTimer ??= setInterval(() => {
      if (this.physicalConnection) void this.refreshInternetAccess();
    }, 15000);
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
    ++this.physicalStatusCheckId;
    this.physicalConnection = await this.getConfirmedPhysicalConnectionStatus();
    if (!this.physicalConnection) {
      this.internetReachable = false;
      this.hasCheckedInternetAccess$.next(true);
      this.publishConnectionState();
      return;
    }
    await this.refreshInternetAccess();
  }

  /** Native uses the durable local queue if Firebase cannot be reached. */
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
    if (!Capacitor.isNativePlatform()) {
      goOnline(this.db);
      this.publishConnectionState();
      return;
    }
    this.physicalConnection = await this.getConfirmedPhysicalConnectionStatus();
    this.publishConnectionState();
    await this.refreshInternetAccess();
  }

  async refreshInternetAccess(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      return this.isOnline$.value;
    }
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

  private async getPhysicalConnectionStatus(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      return typeof navigator === 'undefined' ? true : navigator.onLine;
    }

    const status = await Network.getStatus().catch(() => ({ connected: false }));
    return status.connected;
  }

  private async getConfirmedPhysicalConnectionStatus(): Promise<boolean> {
    const connected = await this.getPhysicalConnectionStatus();
    if (connected || !Capacitor.isNativePlatform()) {
      return connected;
    }

    await this.delay(this.disconnectConfirmDelayMs);
    return this.getPhysicalConnectionStatus();
  }

  private async confirmPhysicalDisconnect(checkId: number): Promise<void> {
    await this.delay(this.disconnectConfirmDelayMs);
    if (checkId !== this.physicalStatusCheckId) {
      return;
    }

    const stillDisconnected = !(await this.getPhysicalConnectionStatus());
    if (checkId !== this.physicalStatusCheckId) {
      return;
    }

    if (!stillDisconnected) {
      this.physicalConnection = true;
      await this.refreshInternetAccess();
      return;
    }

    this.physicalConnection = false;
    this.internetReachable = false;
    this.hasCheckedInternetAccess$.next(true);
    this.publishConnectionState();
  }

  private async probeBackendReachability(): Promise<boolean> {
    if (await this.probeBackendOnce()) {
      return true;
    }

    await new Promise(resolve => setTimeout(resolve, this.reachabilityRetryDelayMs));
    return this.probeBackendOnce();
  }

  private async probeBackendOnce(): Promise<boolean> {
    const url = new URL(environment.firebaseConfig.databaseURL);
    url.pathname = `${url.pathname.replace(/\/$/, '')}/.json`;
    url.searchParams.set('shallow', 'true');
    url.searchParams.set('kw_probe', String(Date.now()));
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.reachabilityTimeoutMs);

    try {
      const response = await fetch(url.toString(), {
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

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private publishConnectionState(): void {
    if (this.isPhysicalConnection$.value !== this.physicalConnection) {
      this.isPhysicalConnection$.next(this.physicalConnection);
    }
    if (this.hasInternetAccess$.value !== this.internetReachable) {
      this.hasInternetAccess$.next(this.internetReachable);
    }
    const online = this.internetReachable &&
      (!Capacitor.isNativePlatform() || !this.serverUnavailable);
    if (this.isOnline$.value !== online) this.isOnline$.next(online);
  }

  private updateWebConnection(connected: boolean): void {
    this.physicalConnection = connected;
    this.internetReachable = connected;
    this.hasCheckedInternetAccess$.next(true);
    if (connected) this.serverUnavailable = false;
    this.publishConnectionState();
  }
}
