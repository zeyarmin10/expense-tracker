import type { VercelRequest, VercelResponse } from '@vercel/node';
import nodemailer from 'nodemailer';
import { google } from 'googleapis';

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
    'https://developers.google.com/oauthplayground' // Redirect URL
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
                user: OAUTH_USER,
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

export default async function handler(
    request: VercelRequest,
    response: VercelResponse,
) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
        response.setHeader('Access-Control-Allow-Origin', '*');
        response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        return response.status(200).end();
    }

    response.setHeader('Access-Control-Allow-Origin', '*'); // Allow all origins for the actual request

    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { to, subject, html } = request.body;
        const mailer = await createTransporter();

        const mailOptions = {
            from: OAUTH_USER, // Your Gmail address
            to: to,
            subject: subject,
            html: html
        };

        const result = await mailer.sendMail(mailOptions);
        return response.status(200).json({ message: 'Email sent successfully', data: result });

    } catch (error: any) {
        console.error('Error sending email:', error);
        return response.status(500).json({ error: 'Failed to send email', details: error.message });
    }
}
