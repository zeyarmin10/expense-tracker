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
  async checkOnResume() {
    const status = await Network.getStatus();
    this.isOnline$.next(status.connected);
  }
}