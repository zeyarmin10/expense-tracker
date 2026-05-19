import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { NotificationTokenRecord } from './notification-utils';
import {
  applyCors,
  getFirebaseAccessToken,
  handleOptions,
  readNotificationTokens,
  requireSecret,
  sendToTokens,
} from './notification-utils';

interface ReminderSendResult {
  sent: number;
  failed: number;
  errors: string[];
}

function splitTokensByLanguage(tokens: NotificationTokenRecord[]): {
  english: NotificationTokenRecord[];
  myanmar: NotificationTokenRecord[];
} {
  return tokens.reduce(
    (groups, token) => {
      if (token.language?.toLowerCase().startsWith('en')) {
        groups.english.push(token);
      } else {
        groups.myanmar.push(token);
      }

      return groups;
    },
    {
      english: [] as NotificationTokenRecord[],
      myanmar: [] as NotificationTokenRecord[],
    },
  );
}

module.exports = async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  applyCors(response);
  if (handleOptions(request, response)) {
    return;
  }

  if (request.method !== 'GET' && request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!requireSecret(request, response, process.env.CRON_SECRET, 'CRON_SECRET')) {
    return;
  }

  try {
    const accessToken = await getFirebaseAccessToken();
    const tokens = await readNotificationTokens(accessToken, {
      dailyOnly: true,
    });

    if (tokens.length === 0) {
      return response.status(200).json({
        message: 'No users have daily reminders enabled',
        sent: 0,
        failed: 0,
      });
    }

    const { english, myanmar } = splitTokensByLanguage(tokens);
    const results: ReminderSendResult[] = [];
    const sharedLink = process.env.DAILY_REMINDER_LINK || '/expense';

    if (myanmar.length > 0) {
      results.push(
        await sendToTokens(accessToken, myanmar, {
          title:
            process.env.DAILY_REMINDER_TITLE_MY ||
            'Expense Tracker သတိပေးချက်',
          body:
            process.env.DAILY_REMINDER_BODY_MY ||
            'ဒီနေ့ အသုံးစရိတ်ထည့်ဖို့ မမေ့ပါနဲ့။',
          link:
            process.env.DAILY_REMINDER_LINK_MY ||
            sharedLink,
          type: 'daily_expense_reminder',
        }),
      );
    }

    if (english.length > 0) {
      results.push(
        await sendToTokens(accessToken, english, {
          title:
            process.env.DAILY_REMINDER_TITLE_EN ||
            'Expense Tracker reminder',
          body:
            process.env.DAILY_REMINDER_BODY_EN ||
            'Do not forget to add today\'s expenses.',
          link:
            process.env.DAILY_REMINDER_LINK_EN ||
            sharedLink,
          type: 'daily_expense_reminder',
        }),
      );
    }

    const result = results.reduce(
      (total, current) => ({
        sent: total.sent + current.sent,
        failed: total.failed + current.failed,
        errors: [...total.errors, ...current.errors],
      }),
      { sent: 0, failed: 0, errors: [] as string[] },
    );

    return response.status(200).json({
      message: 'Daily reminders sent',
      sent: result.sent,
      failed: result.failed,
      languages: {
        my: myanmar.length,
        en: english.length,
      },
      errors: result.errors.slice(0, 5),
    });
  } catch (error: any) {
    console.error('Daily reminder send failed:', error);
    return response.status(500).json({
      error: 'Failed to send daily reminders',
      details: error?.message || 'Unknown error',
    });
  }
};
