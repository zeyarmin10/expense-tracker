import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Auth, onAuthStateChanged } from '@angular/fire/auth';
import type { User } from '@angular/fire/auth';
import { Database, get, ref, remove, set, update } from '@angular/fire/database';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import type { ActionPerformed, Token } from '@capacitor/push-notifications';
import { getApp } from 'firebase/app';
import {
  deleteToken,
  getMessaging,
  getToken,
  isSupported,
  onMessage,
} from 'firebase/messaging';
import type { MessagePayload } from 'firebase/messaging';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

type NotificationPermissionState =
  | NotificationPermission
  | 'prompt'
  | 'prompt-with-rationale'
  | 'unsupported';

interface NotificationDefaults {
  enabled: boolean;
  dailyReminderEnabled: boolean;
}

export interface NotificationSettingsState {
  supported: boolean;
  permission: NotificationPermissionState;
  enabled: boolean;
  dailyReminderEnabled: boolean;
  tokenCount: number;
}

export interface DeveloperNotificationPayload {
  adminSecret: string;
  title: string;
  body: string;
  link?: string;
  targetUid?: string;
}

export interface DeveloperNotificationResult {
  message: string;
  sent: number;
  failed: number;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private readonly auth = inject(Auth);
  private readonly db = inject(Database);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private foregroundListenerStarted = false;
  private nativeListenerStarted = false;
  private autoRegistrationStarted = false;
  private nativeRegistrationResolve: (() => void) | null = null;
  private nativeRegistrationReject: ((error: Error) => void) | null = null;

  initAutoRegistration(): void {
    if (this.autoRegistrationStarted) {
      return;
    }

    this.autoRegistrationStarted = true;
    onAuthStateChanged(this.auth, (user) => {
      if (!user) {
        return;
      }

      void this.ensureDefaultRegistration(user);
    });
  }

  async refreshCurrentRegistration(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) {
      return;
    }

    await this.ensureDefaultRegistration(user);
  }

  async getState(): Promise<NotificationSettingsState> {
    const supported = await this.isPushSupported();
    const user = this.auth.currentUser;
    const baseState: NotificationSettingsState = {
      supported,
      permission: supported ? await this.getPermissionState() : 'unsupported',
      enabled: false,
      dailyReminderEnabled: false,
      tokenCount: 0,
    };

    if (!supported || !user) {
      return baseState;
    }

    const [settingsSnap, tokensSnap] = await Promise.all([
      get(ref(this.db, `notification_settings/${user.uid}`)),
      get(ref(this.db, `notification_tokens/${user.uid}`)),
    ]);
    const settings = settingsSnap.exists() ? settingsSnap.val() : {};
    const tokens = tokensSnap.exists() ? tokensSnap.val() : {};
    const activeTokenCount = Object.values(tokens || {}).filter((token: any) => {
      return token && token.enabled !== false;
    }).length;
    const hasEnabledSetting = typeof settings.enabled !== 'undefined';
    const enabled = hasEnabledSetting ? settings.enabled === true : activeTokenCount > 0;
    const dailyReminderEnabled =
      enabled &&
      (typeof settings.dailyReminderEnabled === 'undefined'
        ? true
        : settings.dailyReminderEnabled !== false);

    return {
      ...baseState,
      enabled,
      dailyReminderEnabled,
      tokenCount: activeTokenCount,
    };
  }

  async enableNotifications(): Promise<NotificationSettingsState> {
    const user = this.auth.currentUser;
    if (!user) {
      throw new Error('NOTIFICATION_LOGIN_REQUIRED');
    }

    if (Capacitor.isNativePlatform()) {
      await this.enableNativeNotifications(user, true);
      return this.getState();
    }

    if (!(await this.isWebPushSupported())) {
      throw new Error('NOTIFICATION_UNSUPPORTED');
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('NOTIFICATION_PERMISSION_DENIED');
    }

    const registration = await this.registerMessagingServiceWorker();
    const messaging = getMessaging(getApp());
    const tokenOptions: {
      serviceWorkerRegistration: ServiceWorkerRegistration;
      vapidKey?: string;
    } = {
      serviceWorkerRegistration: registration,
    };
    const vapidKey = (environment as { firebaseVapidKey?: string }).firebaseVapidKey?.trim();
    if (vapidKey) {
      if (!this.isLikelyValidVapidKey(vapidKey)) {
        throw new Error('NOTIFICATION_VAPID_KEY_INVALID');
      }
      tokenOptions.vapidKey = vapidKey;
    }

    const token = await getToken(messaging, tokenOptions);
    if (!token) {
      throw new Error('NOTIFICATION_TOKEN_FAILED');
    }

    await this.saveToken(user, token, 'web', {
      enabled: true,
      dailyReminderEnabled: true,
    });
    await this.startForegroundListener();
    return this.getState();
  }

  async setDailyReminderEnabled(enabled: boolean): Promise<NotificationSettingsState> {
    const user = this.auth.currentUser;
    if (!user) {
      throw new Error('NOTIFICATION_LOGIN_REQUIRED');
    }

    const tokensSnap = await get(ref(this.db, `notification_tokens/${user.uid}`));
    const tokens = tokensSnap.exists() ? tokensSnap.val() : {};
    const now = Date.now();
    const updates: Record<string, unknown> = {
      [`notification_settings/${user.uid}/enabled`]: true,
      [`notification_settings/${user.uid}/dailyReminderEnabled`]: enabled,
      [`notification_settings/${user.uid}/updatedAt`]: now,
    };

    Object.keys(tokens || {}).forEach((tokenKey) => {
      updates[`notification_tokens/${user.uid}/${tokenKey}/enabled`] = true;
      updates[`notification_tokens/${user.uid}/${tokenKey}/dailyReminderEnabled`] = enabled;
      updates[`notification_tokens/${user.uid}/${tokenKey}/updatedAt`] = now;
    });

    await update(ref(this.db), updates);
    return this.getState();
  }

  async disableNotifications(): Promise<NotificationSettingsState> {
    const user = this.auth.currentUser;
    if (!user) {
      throw new Error('NOTIFICATION_LOGIN_REQUIRED');
    }

    const now = Date.now();
    await update(ref(this.db, `notification_settings/${user.uid}`), {
      enabled: false,
      dailyReminderEnabled: false,
      updatedAt: now,
    });

    if (Capacitor.isNativePlatform()) {
      try {
        await PushNotifications.unregister();
      } catch (error) {
        console.warn('Unable to unregister native push token:', error);
      }
    } else if (await this.isWebPushSupported()) {
      try {
        const messaging = getMessaging(getApp());
        await deleteToken(messaging);
      } catch (error) {
        console.warn('Unable to delete local FCM token:', error);
      }
    }

    try {
      await remove(ref(this.db, `notification_tokens/${user.uid}`));
    } catch (error) {
      console.warn('Unable to remove notification tokens after disabling:', error);
      await this.markUserTokensDisabled(user.uid, now);
    }

    return this.getState();
  }

  async startForegroundListener(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await this.setupNativeListeners();
      return;
    }

    if (this.foregroundListenerStarted || !(await this.isWebPushSupported())) {
      return;
    }

    this.foregroundListenerStarted = true;
    const messaging = getMessaging(getApp());
    onMessage(messaging, (payload) => {
      void this.showForegroundNotification(payload);
    });
  }

  async sendDeveloperNotification(
    payload: DeveloperNotificationPayload,
  ): Promise<DeveloperNotificationResult> {
    return firstValueFrom(
      this.http.post<DeveloperNotificationResult>(
        this.apiUrl('/api/send-notification'),
        payload,
      ),
    );
  }

  private async ensureDefaultRegistration(user: User): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      const defaults = await this.ensureDefaultSettings(user.uid);
      if (defaults.enabled && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          await this.enableNotifications();
        } catch (error) {
          console.warn('Web notification auto-registration skipped:', error);
        }
      }
      return;
    }

    const defaults = await this.ensureDefaultSettings(user.uid);
    await this.setupNativeListeners();

    if (!defaults.enabled) {
      return;
    }

    try {
      await this.enableNativeNotifications(user, false);
    } catch (error) {
      console.warn('Native notification auto-registration skipped:', error);
    }
  }

  private async enableNativeNotifications(
    user: User,
    throwOnDenied: boolean,
  ): Promise<void> {
    await this.setupNativeListeners();
    await this.createNativeNotificationChannel();
    await this.ensureDefaultSettings(user.uid);

    let permission = await PushNotifications.checkPermissions();
    if (permission.receive === 'denied') {
      await update(ref(this.db, `notification_settings/${user.uid}`), {
        enabled: false,
        dailyReminderEnabled: false,
        permissionStatus: permission.receive,
        updatedAt: Date.now(),
      });

      if (throwOnDenied) {
        throw new Error('NOTIFICATION_PERMISSION_DENIED');
      }

      return;
    }

    if (permission.receive !== 'granted') {
      permission = await PushNotifications.requestPermissions();
    }

    if (permission.receive !== 'granted') {
      await update(ref(this.db, `notification_settings/${user.uid}`), {
        enabled: false,
        dailyReminderEnabled: false,
        permissionStatus: permission.receive,
        updatedAt: Date.now(),
      });

      if (throwOnDenied) {
        throw new Error('NOTIFICATION_PERMISSION_DENIED');
      }

      return;
    }

    await update(ref(this.db, `notification_settings/${user.uid}`), {
      enabled: true,
      dailyReminderEnabled: true,
      permissionStatus: permission.receive,
      updatedAt: Date.now(),
    });

    await this.registerNativePush();
  }

  private async setupNativeListeners(): Promise<void> {
    if (this.nativeListenerStarted || !Capacitor.isNativePlatform()) {
      return;
    }

    this.nativeListenerStarted = true;

    await PushNotifications.addListener('registration', (token: Token) => {
      const user = this.auth.currentUser;
      if (!user) {
        return;
      }

      void this.saveToken(user, token.value, Capacitor.getPlatform());
      this.nativeRegistrationResolve?.();
      this.nativeRegistrationResolve = null;
      this.nativeRegistrationReject = null;
    });

    await PushNotifications.addListener('registrationError', (error) => {
      const registrationError = new Error(error.error || 'Native push registration failed');
      this.nativeRegistrationReject?.(registrationError);
      this.nativeRegistrationResolve = null;
      this.nativeRegistrationReject = null;
      console.error('Native push registration error:', error);
    });

    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.info('Push notification received:', notification);
    });

    await PushNotifications.addListener(
      'pushNotificationActionPerformed',
      (event: ActionPerformed) => {
        this.openNotificationLink(
          event.notification.data?.link ||
            event.notification.link ||
            event.notification.data?.url ||
            '/expense',
        );
      },
    );
  }

  private async registerNativePush(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.nativeRegistrationResolve = null;
        this.nativeRegistrationReject = null;
        resolve();
      }, 10000);

      this.nativeRegistrationResolve = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      this.nativeRegistrationReject = (error: Error) => {
        window.clearTimeout(timeout);
        reject(error);
      };

      void PushNotifications.register().catch((error) => {
        window.clearTimeout(timeout);
        reject(error);
      });
    });
  }

  private async createNativeNotificationChannel(): Promise<void> {
    try {
      await PushNotifications.createChannel({
        id: 'expense_reminders',
        name: 'Expense Tracker',
        description: 'Expense reminders and app announcements',
        importance: 4,
        visibility: 1,
        lights: true,
        lightColor: '#0B74FF',
        vibration: true,
      });
    } catch (error) {
      console.warn('Unable to create notification channel:', error);
    }
  }

  private async saveToken(
    user: User,
    token: string,
    platform: string,
    settingsOverride?: NotificationDefaults,
  ): Promise<void> {
    const defaults = settingsOverride || (await this.ensureDefaultSettings(user.uid));
    if (!defaults.enabled) {
      return;
    }

    const now = Date.now();
    const tokenKey = this.toTokenKey(token);
    const tokenData = {
      token,
      uid: user.uid,
      email: user.email || null,
      displayName: user.displayName || null,
      platform,
      enabled: true,
      dailyReminderEnabled: defaults.dailyReminderEnabled,
      language: localStorage.getItem('selectedLanguage') || 'my',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
      userAgent: navigator.userAgent,
      createdAt: now,
      updatedAt: now,
    };

    await Promise.all([
      set(ref(this.db, `notification_tokens/${user.uid}/${tokenKey}`), tokenData),
      update(ref(this.db, `notification_settings/${user.uid}`), {
        enabled: true,
        dailyReminderEnabled: defaults.dailyReminderEnabled,
        lastTokenKey: tokenKey,
        lastPlatform: platform,
        updatedAt: now,
      }),
    ]);
  }

  private async markUserTokensDisabled(userId: string, updatedAt: number): Promise<void> {
    try {
      const tokensSnap = await get(ref(this.db, `notification_tokens/${userId}`));
      const tokens = tokensSnap.exists() ? tokensSnap.val() : {};
      const updates: Record<string, unknown> = {};

      Object.keys(tokens || {}).forEach((tokenKey) => {
        updates[`notification_tokens/${userId}/${tokenKey}/enabled`] = false;
        updates[`notification_tokens/${userId}/${tokenKey}/dailyReminderEnabled`] = false;
        updates[`notification_tokens/${userId}/${tokenKey}/updatedAt`] = updatedAt;
      });

      if (Object.keys(updates).length > 0) {
        await update(ref(this.db), updates);
      }
    } catch (error) {
      console.warn('Unable to mark notification tokens disabled:', error);
    }
  }

  private async ensureDefaultSettings(userId: string): Promise<NotificationDefaults> {
    const settingsRef = ref(this.db, `notification_settings/${userId}`);
    const snapshot = await get(settingsRef);
    const settings = snapshot.exists() ? snapshot.val() : {};
    const defaults = {
      enabled: settings.enabled === true,
      dailyReminderEnabled: settings.dailyReminderEnabled === true,
    };

    if (
      !snapshot.exists() ||
      typeof settings.enabled === 'undefined' ||
      typeof settings.dailyReminderEnabled === 'undefined'
    ) {
      await update(settingsRef, {
        enabled: defaults.enabled,
        dailyReminderEnabled: defaults.dailyReminderEnabled,
        updatedAt: Date.now(),
      });
    }

    return defaults;
  }

  private async isPushSupported(): Promise<boolean> {
    if (Capacitor.isNativePlatform()) {
      return true;
    }

    return this.isWebPushSupported();
  }

  private async isWebPushSupported(): Promise<boolean> {
    if (
      typeof window === 'undefined' ||
      !('Notification' in window) ||
      !('serviceWorker' in navigator)
    ) {
      return false;
    }

    try {
      return await isSupported();
    } catch {
      return false;
    }
  }

  private isLikelyValidVapidKey(vapidKey: string): boolean {
    return /^[A-Za-z0-9_-]{80,120}$/.test(vapidKey);
  }

  private async registerMessagingServiceWorker(): Promise<ServiceWorkerRegistration> {
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      updateViaCache: 'none',
    });

    if (registration.active) {
      return registration;
    }

    const pendingWorker = registration.installing || registration.waiting;
    if (!pendingWorker) {
      return this.waitForReadyServiceWorker();
    }
    const worker = pendingWorker;

    await new Promise<void>((resolve, reject) => {
      let timeout = 0;

      function cleanup() {
        window.clearTimeout(timeout);
        worker.removeEventListener('statechange', handleStateChange);
      }

      function handleStateChange() {
        if (worker.state === 'activated') {
          cleanup();
          resolve();
        }
      }

      timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('NOTIFICATION_SERVICE_WORKER_INACTIVE'));
      }, 10000);

      worker.addEventListener('statechange', handleStateChange);
      handleStateChange();
    });

    return registration;
  }

  private async waitForReadyServiceWorker(): Promise<ServiceWorkerRegistration> {
    return Promise.race([
      navigator.serviceWorker.ready,
      new Promise<ServiceWorkerRegistration>((_, reject) => {
        window.setTimeout(() => {
          reject(new Error('NOTIFICATION_SERVICE_WORKER_INACTIVE'));
        }, 10000);
      }),
    ]);
  }

  private async getPermissionState(): Promise<NotificationPermissionState> {
    if (Capacitor.isNativePlatform()) {
      const permission = await PushNotifications.checkPermissions();
      return permission.receive;
    }

    if (typeof Notification === 'undefined') {
      return 'unsupported';
    }

    return Notification.permission;
  }

  private async showForegroundNotification(payload: MessagePayload): Promise<void> {
    if (Notification.permission !== 'granted') {
      return;
    }

    const title =
      payload.notification?.title ||
      payload.data?.['title'] ||
      'Expense Tracker';
    const body =
      payload.notification?.body ||
      payload.data?.['body'] ||
      '';
    const link = payload.fcmOptions?.link || payload.data?.['link'] || '/expense';

    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, {
      body,
      icon: '/assets/images/Expense-Tracker-Logo.png',
      badge: '/favicon.ico',
      data: { link },
    });
  }

  private openNotificationLink(link: string): void {
    try {
      const target = new URL(link, window.location.origin);
      const appPath = `${target.pathname}${target.search}${target.hash}`;

      if (target.origin === window.location.origin || link.startsWith('/')) {
        void this.router.navigateByUrl(appPath || '/expense');
        return;
      }

      window.location.href = target.toString();
    } catch {
      void this.router.navigateByUrl('/expense');
    }
  }

  private toTokenKey(token: string): string {
    return btoa(token)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  private apiUrl(path: string): string {
    const baseUrl = (environment as { apiBaseUrl?: string }).apiBaseUrl || '';
    return `${baseUrl}${path}`;
  }
}
