import { createHash } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  applyCors,
  getFirebaseAccessToken,
  handleOptions,
} from './notification-utils.js';

// Permanently deletes Cloudinary assets after their app record is removed
// (voucher deleted, profile photo removed/replaced), so orphaned images
// don't accumulate storage forever.
//
// Auth model: the caller sends their Firebase ID token; each public_id is
// then authorized against the folder it lives in —
//   profiles/{uid}/…          → only that user
//   vouchers/users/{uid}/…    → only that user
//   category-icons/{uid}/…    → only the user who uploaded it
//   space-images/{uid}/…      → only the user who uploaded it
//   vouchers/spaces/{id}/…    → any current member of that space
//   vouchers/groups/{id}/…    → any current member of that group
// Anything outside those folders is refused.

const FIREBASE_WEB_API_KEY =
  process.env['FIREBASE_WEB_API_KEY'] || 'AIzaSyDJJXDNDCIweU0FzYIZJCMErKHcSLbzvS8';
const FIREBASE_DATABASE_URL = (
  process.env['FIREBASE_DATABASE_URL'] ||
  'https://expense-tracker-c94e8-default-rtdb.asia-southeast1.firebasedatabase.app'
).replace(/\/$/, '');
const CLOUDINARY_CLOUD_NAME = process.env['CLOUDINARY_CLOUD_NAME'] || 'da0zqvrps';

const MAX_IDS_PER_REQUEST = 30;

async function verifyIdToken(idToken: string): Promise<string | null> {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    },
  );
  if (!response.ok) return null;
  const data = (await response.json()) as { users?: { localId?: string }[] };
  return data.users?.[0]?.localId || null;
}

async function isMember(
  accessToken: string,
  collection: 'space_members' | 'group_members',
  containerId: string,
  uid: string,
): Promise<boolean> {
  const response = await fetch(
    `${FIREBASE_DATABASE_URL}/${collection}/${encodeURIComponent(containerId)}/${encodeURIComponent(uid)}.json`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) return false;
  const value = await response.json();
  return value !== null;
}

async function isAllowed(
  publicId: string,
  uid: string,
  getAccessToken: () => Promise<string>,
): Promise<boolean> {
  const ownParticipantMatch = publicId.match(/^(?:profiles|vouchers\/users|category-icons|space-images)\/([^/]+)\//);
  if (ownParticipantMatch) {
    return ownParticipantMatch[1] === uid;
  }

  const sharedMatch = publicId.match(/^vouchers\/(spaces|groups)\/([^/]+)\//);
  if (sharedMatch) {
    const collection = sharedMatch[1] === 'spaces' ? 'space_members' : 'group_members';
    return isMember(await getAccessToken(), collection, sharedMatch[2], uid);
  }

  return false;
}

async function destroyCloudinaryAsset(publicId: string): Promise<'deleted' | 'not_found' | 'error'> {
  const apiKey = process.env['CLOUDINARY_API_KEY'] || '';
  const apiSecret = process.env['CLOUDINARY_API_SECRET'] || '';
  if (!apiKey || !apiSecret) {
    throw new Error('Missing CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET env vars');
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHash('sha1')
    .update(`invalidate=true&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`)
    .digest('hex');

  const formData = new FormData();
  formData.append('public_id', publicId);
  formData.append('invalidate', 'true');
  formData.append('timestamp', String(timestamp));
  formData.append('api_key', apiKey);
  formData.append('signature', signature);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/destroy`,
    { method: 'POST', body: formData },
  );
  const data = (await response.json().catch(() => ({}))) as { result?: string };
  if (data.result === 'ok') return 'deleted';
  if (data.result === 'not found') return 'not_found';
  return 'error';
}

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  applyCors(response);
  if (handleOptions(request, response)) {
    return;
  }

  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  const idToken = (request.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!idToken) {
    return response.status(401).json({ error: 'Missing Authorization bearer token' });
  }

  const uid = await verifyIdToken(idToken);
  if (!uid) {
    return response.status(401).json({ error: 'Invalid or expired ID token' });
  }

  const rawIds = (request.body || {}).publicIds;
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return response.status(400).json({ error: 'publicIds must be a non-empty array' });
  }
  const publicIds = [...new Set(rawIds.filter((id) => typeof id === 'string' && id.trim()))]
    .map((id: string) => id.trim())
    .slice(0, MAX_IDS_PER_REQUEST);

  // Service-account token fetched at most once per request, and only when a
  // shared-space/group membership check is actually needed.
  let accessTokenPromise: Promise<string> | null = null;
  const getAccessToken = () => (accessTokenPromise ??= getFirebaseAccessToken());

  try {
    const results: Record<string, string> = {};
    for (const publicId of publicIds) {
      if (!(await isAllowed(publicId, uid, getAccessToken))) {
        results[publicId] = 'forbidden';
        continue;
      }
      results[publicId] = await destroyCloudinaryAsset(publicId);
    }

    return response.status(200).json({ results });
  } catch (error: any) {
    console.error('Image deletion failed:', error);
    return response.status(500).json({
      error: 'Failed to delete images',
      details: error?.message || 'Unknown error',
    });
  }
}
