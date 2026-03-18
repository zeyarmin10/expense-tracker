import { Injectable } from '@angular/core';
import { Network } from '@capacitor/network';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class NetworkService {
  isOnline$ = new BehaviorSubject<boolean>(true);
  private initialized = false;

  async init() {
    // ✅ တစ်ကြိမ်တည်းသာ init လုပ်မယ် — foreground ပြန်ဝင်ရင် ထပ်မ run
    if (this.initialized) return;
    this.initialized = true;

    const status = await Network.getStatus();
    this.isOnline$.next(status.connected);

    Network.addListener('networkStatusChange', (status) => {
      this.isOnline$.next(status.connected);
    });
  }
}
