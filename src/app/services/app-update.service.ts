import { Injectable, inject } from '@angular/core';
import { Database, ref, get } from '@angular/fire/database';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import {
  AppUpdate,
  AppUpdateAvailability,
  AppUpdateResultCode,
  type FlexibleUpdateState,
} from '@capawesome/capacitor-app-update';

export interface AppUpdateStatus {
  updateAvailable: boolean;
  latestVersionName?: string;
  // Android only — whether a background (non-blocking) in-app update is offered.
  flexibleUpdateAllowed?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class AppUpdateService {
  private db = inject(Database);

  // Keep in sync with android/app/build.gradle's applicationId.
  private readonly androidAppId = 'com.ethan.expensetracker';
  // Numeric Apple ID from the App Store listing URL — fill in once the app is published on iOS.
  private readonly iosAppId = '';

  async checkForUpdate(): Promise<AppUpdateStatus> {
    if (!Capacitor.isNativePlatform()) {
      return { updateAvailable: false };
    }

    const platform = Capacitor.getPlatform();
    if (platform === 'android') {
      return this.checkAndroidUpdate();
    }
    if (platform === 'ios') {
      return this.checkIosUpdate();
    }
    return { updateAvailable: false };
  }

  private async checkAndroidUpdate(): Promise<AppUpdateStatus> {
    try {
      const info = await AppUpdate.getAppUpdateInfo();
      if (info.updateAvailability !== AppUpdateAvailability.UPDATE_AVAILABLE) {
        return { updateAvailable: false };
      }
      return {
        updateAvailable: true,
        flexibleUpdateAllowed: info.flexibleUpdateAllowed,
      };
    } catch (error) {
      // Play Core only resolves for Play Store installs (not sideloaded/
      // internal-test builds) — fall back to our own remote-config check.
      console.error('Play Core update check failed, falling back to Firebase config:', error);
      return this.checkAndroidUpdateViaFirebase();
    }
  }

  private async checkAndroidUpdateViaFirebase(): Promise<AppUpdateStatus> {
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

  private async checkIosUpdate(): Promise<AppUpdateStatus> {
    try {
      const info = await AppUpdate.getAppUpdateInfo();
      return {
        updateAvailable: info.updateAvailability === AppUpdateAvailability.UPDATE_AVAILABLE,
        latestVersionName: info.availableVersionName,
      };
    } catch (error) {
      console.error('Error checking for iOS app update:', error);
      return { updateAvailable: false };
    }
  }

  /** Android only. Downloads the update in the background; caller should
   *  listen via `addFlexibleUpdateListener` for the DOWNLOADED state and
   *  then call `completeFlexibleUpdate()` to restart into it. */
  async startFlexibleUpdate(): Promise<boolean> {
    try {
      const result = await AppUpdate.startFlexibleUpdate();
      return result.code === AppUpdateResultCode.OK;
    } catch (error) {
      console.error('Error starting flexible update:', error);
      return false;
    }
  }

  completeFlexibleUpdate(): Promise<void> {
    return AppUpdate.completeFlexibleUpdate();
  }

  addFlexibleUpdateListener(
    callback: (state: FlexibleUpdateState) => void
  ): Promise<PluginListenerHandle> {
    return AppUpdate.addListener('onFlexibleUpdateStateChange', callback);
  }

  /** Opens the Play Store (Android) or App Store (iOS) listing for this app. */
  openStore(): void {
    const platform = Capacitor.getPlatform();
    if (platform === 'ios' && !this.iosAppId) {
      console.warn('AppUpdateService: iosAppId is not configured yet — cannot open the App Store.');
      return;
    }

    AppUpdate.openAppStore(
      platform === 'android' ? { androidPackageName: this.androidAppId } : { appId: this.iosAppId }
    ).catch(() => {
      if (platform === 'android') {
        window.open(`https://play.google.com/store/apps/details?id=${this.androidAppId}`, '_system');
      }
    });
  }
}
