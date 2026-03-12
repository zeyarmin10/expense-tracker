import { Injectable } from '@angular/core';
import { Network } from '@capacitor/network';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class NetworkService {
  isOnline$ = new BehaviorSubject<boolean>(true);

  async init() {
    const status = await Network.getStatus();
    this.isOnline$.next(status.connected);

    Network.addListener('networkStatusChange', (status) => {
      this.isOnline$.next(status.connected);
    });
  }
}