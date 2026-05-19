import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';

export interface NotificationTokenRecord {
  token: string;
  uid: string;
  email?: string | null;
  displayName?: string | null;
  enabled?: boolean;
  dailyReminderEnabled?: boolean;
  language?: string;
  timezone?: string;
}

interface NotificationSettingRecord {
  enabled?: boolean;
  dailyReminderEnabled?: boolean;
}

export interface NotificationSendPayload {
  title: string;
  body: string;
  link?: string;
  type?: string;
}

const FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID || 'expense-tracker-c94e8';
const FIREBASE_DATABASE_URL =
  process.env.FIREBASE_DATABASE_URL ||
  'https://expense-tracker-c94e8-default-rtdb.asia-southeast1.firebasedatabase.app';
const APP_ORIGIN =
  process.env.APP_ORIGIN ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');

export function applyCors(response: VercelResponse): void {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Admin-Secret, X-Cron-Secret',
  );
}

export function handleOptions(
  request: VercelRequest,
  response: VercelResponse,
): boolean {
  if (request.method === 'OPTIONS') {
    applyCors(response);
    response.status(200).end();
    return true;
  }

  return false;
}

export function getRequestSecret(request: VercelRequest): string {
  const bodySecret =
    typeof request.body === 'object' && request.body
      ? String(request.body.adminSecret || request.body.secret || '')
      : '';
  const headerSecret = String(
    request.headers['x-admin-secret'] ||
      request.headers['x-cron-secret'] ||
      '',
  );
  const authHeader = String(request.headers.authorization || '');

  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }

  return bodySecret || headerSecret;
}

export function requireSecret(
  request: VercelRequest,
  response: VercelResponse,
  expectedSecret: string | undefined,
  label: string,
): boolean {
  if (!expectedSecret) {
    response.status(500).json({ error: `${label} is not configured` });
    return false;
  }

  if (getRequestSecret(request) !== expectedSecret) {
    response.status(401).json({ error: 'Unauthorized' });
    return false;
  }

  return true;
}

export async function getFirebaseAccessToken(): Promise<string> {
  const clientEmail = (
    process.env.FIREBASE_SERVICE_ACCOUNT_EMAIL ||
    process.env.FIREBASE_CLIENT_EMAIL ||
    ''
  ).trim();
  const privateKey = (
    process.env.FIREBASE_PRIVATE_KEY ||
    process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY ||
    ''
  ).replace(/\\n/g, '\n');

  if (!clientEmail || !privateKey) {
    throw new Error(
      'Missing Firebase service account env vars: FIREBASE_SERVICE_ACCOUNT_EMAIL and FIREBASE_PRIVATE_KEY',
    );
  }

  const authClient = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: [
      'https://www.googleapis.com/auth/firebase.messaging',
      'https://www.googleapis.com/auth/firebase.database',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
  });

  const tokenResponse = await authClient.authorize();
  if (!tokenResponse.access_token) {
    throw new Error('Unable to create Firebase access token');
  }

  return tokenResponse.access_token;
}

export async function readNotificationTokens(
  accessToken: string,
  options: { targetUid?: string; dailyOnly?: boolean } = {},
): Promise<NotificationTokenRecord[]> {
  const baseUrl = FIREBASE_DATABASE_URL.replace(/\/$/, '');
  const target = options.targetUid?.trim();
  const canReadTargetPath = !!target && isValidFirebaseDatabaseKey(target);
  const path = canReadTargetPath
    ? `/notification_tokens/${encodeURIComponent(target)}.json`
    : '/notification_tokens.json';
  const headers = {
    Authorization: `Bearer ${accessToken}`,
  };
  const response = await fetch(`${baseUrl}${path}`, { headers });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Unable to read notification tokens: ${text}`);
  }

  const settingsPath = canReadTargetPath
    ? `/notification_settings/${encodeURIComponent(target)}.json`
    : '/notification_settings.json';
  const settingsResponse = await fetch(`${baseUrl}${settingsPath}`, { headers });
  let settingsData: Record<string, NotificationSettingRecord> | NotificationSettingRecord = {};

  if (settingsResponse.ok) {
    settingsData = await settingsResponse.json() || {};
  }

  const data = await response.json();
  if (!data) {
    return [];
  }

  const records: NotificationTokenRecord[] = [];
  if (canReadTargetPath && target) {
    Object.values(data).forEach((value: any) => {
      if (value?.token) {
        records.push({ ...value, uid: target });
      }
    });
  } else {
    Object.entries(data).forEach(([uid, tokenMap]) => {
      Object.values((tokenMap || {}) as Record<string, any>).forEach((value: any) => {
        if (value?.token) {
          records.push({ ...value, uid: value.uid || uid });
        }
      });
    });
  }

  return records.filter((record) => {
    if (target && !matchesNotificationTarget(record, target)) {
      return false;
    }

    const settings = canReadTargetPath
      ? settingsData as NotificationSettingRecord
      : (settingsData as Record<string, NotificationSettingRecord>)[record.uid] || {};

    if (settings.enabled === false) {
      return false;
    }
    if (record.enabled === false) {
      return false;
    }
    if (options.dailyOnly) {
      if (settings.dailyReminderEnabled === false) {
        return false;
      }
      return record.dailyReminderEnabled !== false;
    }
    return true;
  });
}

function isValidFirebaseDatabaseKey(value: string): boolean {
  return value.length > 0 && !/[.#$/[\]]/.test(value);
}

function matchesNotificationTarget(
  record: NotificationTokenRecord,
  target: string,
): boolean {
  const normalizedTarget = target.toLowerCase();
  return (
    record.uid === target ||
    record.email?.toLowerCase() === normalizedTarget ||
    record.displayName?.toLowerCase() === normalizedTarget
  );
}

export async function sendFcmMessage(
  accessToken: string,
  token: string,
  payload: NotificationSendPayload,
): Promise<void> {
  const link = payload.link || '/expense';
  const absoluteLink = toAbsoluteLink(link);
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token,
          notification: {
            title: payload.title,
            body: payload.body,
          },
          data: {
            title: payload.title,
            body: payload.body,
            link,
            type: payload.type || 'developer_message',
          },
          webpush: {
            fcmOptions: {
              link: absoluteLink,
            },
            notification: {
              icon: '/assets/images/Expense-Tracker-Logo.png',
              badge: '/favicon.ico',
            },
          },
          android: {
            priority: 'HIGH',
            notification: {
              channel_id: 'expense_reminders',
              color: '#0B74FF',
            },
          },
        },
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'FCM send failed');
  }
}

function toAbsoluteLink(link: string): string {
  if (/^https?:\/\//i.test(link)) {
    return link;
  }

  if (!APP_ORIGIN) {
    return link;
  }

  return new URL(link, APP_ORIGIN).toString();
}

export async function sendToTokens(
  accessToken: string,
  tokens: NotificationTokenRecord[],
  payload: NotificationSendPayload,
): Promise<{ sent: number; failed: number; errors: string[] }> {
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  await Promise.all(
    tokens.map(async (record) => {
      try {
        await sendFcmMessage(accessToken, record.token, payload);
        sent += 1;
      } catch (error: any) {
        failed += 1;
        errors.push(error?.message || 'Unknown FCM error');
      }
    }),
  );

  return { sent, failed, errors };
}
