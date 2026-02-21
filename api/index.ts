import type { VercelRequest, VercelResponse } from '@vercel/node';

// Use CommonJS require syntax instead of import
const nodemailer = require('nodemailer');
const { google } = require('googleapis');

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

// Use module.exports instead of export default
module.exports = async function handler(
    request: VercelRequest,
    response: VercelResponse,
) {
    // --- START DEBUG LOGGING ---
    console.log(`[DEBUG] Attempting to send email. OAUTH_USER: ${OAUTH_USER}`);
    console.log(`[DEBUG] CLIENT_ID starts with: ${OAUTH_CLIENT_ID ? OAUTH_CLIENT_ID.substring(0, 10) : 'NOT FOUND'}`);
    console.log(`[DEBUG] REFRESH_TOKEN is present: ${OAUTH_REFRESH_TOKEN ? 'Yes' : 'No'}`);
    // --- END DEBUG LOGGING ---

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
        response.setHeader('Access-Control-Allow-Origin', '*');
        response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        return response.status(200).end();
    }

    response.setHeader('Access-Control-Allow-Origin', '*'); // Allow all origins

    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { to, subject, html } = request.body;
        
        if (!to || !subject || !html) {
            return response.status(400).json({ error: 'Missing required fields: to, subject, html' });
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
