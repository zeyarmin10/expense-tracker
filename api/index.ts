import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as nodemailer from 'nodemailer';
import { google } from 'googleapis';
import {
  applyCors,
  getBearerToken,
  handleOptions,
  verifyIdToken,
} from './notification-utils.js';

const OAuth2 = google.auth.OAuth2;

const { 
    OAUTH_CLIENT_ID, 
    OAUTH_CLIENT_SECRET, 
    OAUTH_REFRESH_TOKEN, 
    OAUTH_USER 
} = process.env;

const oauth2Client = new OAuth2(
    OAUTH_CLIENT_ID,
    OAUTH_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground'
);

oauth2Client.setCredentials({
    refresh_token: OAUTH_REFRESH_TOKEN
});

async function createTransporter() {
    try {
        const accessToken = await oauth2Client.getAccessToken();
        
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                type: 'OAuth2',
                user: OAUTH_USER, // Your Gmail address from .env
                clientId: OAUTH_CLIENT_ID,
                clientSecret: OAUTH_CLIENT_SECRET,
                refreshToken: OAUTH_REFRESH_TOKEN,
                accessToken: accessToken.token as string,
            }
        });

        return transporter;
    } catch (error) {
        console.error('Error creating transporter:', error);
        throw new Error('Failed to create email transporter');
    }
}

// Basic shape check, not full RFC 5322 validation — just enough to reject
// obvious junk (multiple/blank addresses) before it reaches nodemailer.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

    // This endpoint sends mail from the app's own Gmail account, so it must
    // only be reachable by a signed-in app user — without this it was an
    // open relay: anyone on the internet could POST arbitrary to/subject/html
    // and have it delivered from our address (spam/phishing abuse risk).
    const idToken = getBearerToken(request);
    if (!idToken) {
        return response.status(401).json({ error: 'Missing Authorization bearer token' });
    }
    const uid = await verifyIdToken(idToken);
    if (!uid) {
        return response.status(401).json({ error: 'Invalid or expired ID token' });
    }

    try {
        const { to, subject, html } = request.body;

        if (!to || !subject || !html) {
            return response.status(400).json({ error: 'Missing required fields: to, subject, html' });
        }
        if (typeof to !== 'string' || !EMAIL_PATTERN.test(to)) {
            return response.status(400).json({ error: 'Invalid recipient email' });
        }

        const mailer = await createTransporter();

        const mailOptions = {
            from: OAUTH_USER, // Sender address
            to: to,               // List of recipients
            subject: subject,     // Subject line
            html: html,           // HTML body
        };

        const result = await mailer.sendMail(mailOptions);
        return response.status(200).json({ message: 'Email sent successfully', data: result.response });

    } catch (error: any) {
        console.error('Error sending email:', error);
        return response.status(500).json({ error: 'Failed to send email', details: error.message });
    }
};
