import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class SpaceSwitchLoadingService {
  private readonly loadingSubject = new BehaviorSubject<boolean>(false);
  readonly loading$ = this.loadingSubject.asObservable();

  private activeSwitchToken = 0;
  private pendingLoads = 0;
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private finishTimer: ReturnType<typeof setTimeout> | null = null;

  beginSwitch(): number {
    this.activeSwitchToken += 1;
    this.pendingLoads = 0;
    this.clearTimer('finish');
    this.clearTimer('fallback');
    this.loadingSubject.next(true);

    const token = this.activeSwitchToken;
    this.fallbackTimer = setTimeout(() => {
      this.finishSwitch(token);
    }, 2200);

    return token;
  }

  cancelSwitch(token: number): void {
    if (token !== this.activeSwitchToken) {
      return;
    }

    this.finishSwitch(token);
  }

  track<T>(source$: Observable<T>): Observable<T> {
    return new Observable<T>((observer) => {
      const token = this.activeSwitchToken;
      const shouldTrack = this.loadingSubject.getValue();
      let settled = false;

      if (shouldTrack) {
        this.beginTrackedLoad(token);
      }

      const settle = () => {
        if (!shouldTrack || settled) {
          return;
        }

        settled = true;
        this.endTrackedLoad(token);
      };

      const subscription = source$.subscribe({
        next: (value) => {
          observer.next(value);
          settle();
        },
        error: (error) => {
          settle();
          observer.error(error);
        },
        complete: () => {
          settle();
          observer.complete();
        },
      });

      return () => {
        settle();
        subscription.unsubscribe();
      };
    });
  }

  async trackPromise<T>(promise: Promise<T>): Promise<T> {
    const token = this.activeSwitchToken;
    const shouldTrack = this.loadingSubject.getValue();

    if (shouldTrack) {
      this.beginTrackedLoad(token);
    }

    try {
      return await promise;
    } finally {
      if (shouldTrack) {
        this.endTrackedLoad(token);
      }
    }
  }

  private beginTrackedLoad(token: number): void {
    if (token !== this.activeSwitchToken || !this.loadingSubject.getValue()) {
      return;
    }

    this.clearTimer('fallback');
    this.clearTimer('finish');
    this.pendingLoads += 1;
  }

  private endTrackedLoad(token: number): void {
    if (token !== this.activeSwitchToken) {
      return;
    }

    this.pendingLoads = Math.max(0, this.pendingLoads - 1);
    if (this.pendingLoads === 0) {
      this.scheduleFinish(token);
    }
  }

  private scheduleFinish(token: number): void {
    this.clearTimer('fallback');
    this.clearTimer('finish');
    this.finishTimer = setTimeout(() => {
      if (token === this.activeSwitchToken && this.pendingLoads === 0) {
        this.finishSwitch(token);
      }
    }, 550);
  }

  private finishSwitch(token: number): void {
    if (token !== this.activeSwitchToken) {
      return;
    }

    this.clearTimer('fallback');
    this.clearTimer('finish');
    this.pendingLoads = 0;
    this.loadingSubject.next(false);
  }

  private clearTimer(type: 'fallback' | 'finish'): void {
    const timer = type === 'fallback' ? this.fallbackTimer : this.finishTimer;
    if (timer) {
      clearTimeout(timer);
    }

    if (type === 'fallback') {
      this.fallbackTimer = null;
    } else {
      this.finishTimer = null;
    }
  }
}
