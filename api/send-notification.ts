import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  applyCors,
  getFirebaseAccessToken,
  handleOptions,
  readNotificationTokens,
  requireSecret,
  sendToTokens,
} from './notification-utils.js';

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

  if (
    !requireSecret(
      request,
      response,
      process.env.NOTIFICATION_ADMIN_SECRET,
      'NOTIFICATION_ADMIN_SECRET',
    )
  ) {
    return;
  }

  try {
    const { title, body, link, targetUid } = request.body || {};

    if (!title || !body) {
      return response
        .status(400)
        .json({ error: 'Missing required fields: title and body' });
    }

    const accessToken = await getFirebaseAccessToken();
    const tokens = await readNotificationTokens(accessToken, {
      targetUid: targetUid || undefined,
      dailyOnly: false,
    });

    if (tokens.length === 0) {
      return response.status(200).json({
        message: 'No notification tokens found',
        sent: 0,
        failed: 0,
      });
    }

    const result = await sendToTokens(accessToken, tokens, {
      title: String(title),
      body: String(body),
      link: link ? String(link) : '/expense',
      type: 'developer_message',
    });

    return response.status(200).json({
      message: 'Notification send completed',
      sent: result.sent,
      failed: result.failed,
      errors: result.errors.slice(0, 5),
    });
  } catch (error: any) {
    console.error('Notification send failed:', error);
    return response.status(500).json({
      error: 'Failed to send notification',
      details: error?.message || 'Unknown error',
    });
  }
}
