import { Injectable, inject } from '@angular/core';
import { Database, ref, get } from '@angular/fire/database';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';

export interface AppUpdateStatus {
  updateAvailable: boolean;
  latestVersionName?: string;
}

@Injectable({
  providedIn: 'root',
})
export class AppUpdateService {
  private db = inject(Database);

  // Keep in sync with android/app/build.gradle's applicationId.
  private readonly androidAppId = 'com.ethan.expensetracker';

  async checkForUpdate(): Promise<AppUpdateStatus> {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      return { updateAvailable: false };
    }

    try {
      const [info, configSnap] = await Promise.all([
        CapacitorApp.getInfo(),
        get(ref(this.db, 'appConfig/android')),
      ]);

      const config = configSnap.val() as { latestVersionCode?: number; latestVersionName?: string } | null;
      if (!config?.latestVersionCode) {
        return { updateAvailable: false };
      }

      const currentVersionCode = Number(info.build);
      if (!Number.isFinite(currentVersionCode)) {
        return { updateAvailable: false };
      }

      return {
        updateAvailable: config.latestVersionCode > currentVersionCode,
        latestVersionName: config.latestVersionName,
      };
    } catch (error) {
      console.error('Error checking for app update:', error);
      return { updateAvailable: false };
    }
  }

  openPlayStore(): void {
    const url = `https://play.google.com/store/apps/details?id=${this.androidAppId}`;
    window.open(url, '_system');
  }
}
