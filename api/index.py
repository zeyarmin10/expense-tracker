
from flask import Flask, request, jsonify
from flask_cors import CORS
import smtplib
from email.mime.text import MIMEText
import os

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Configure your email server details from environment variables
SMTP_SERVER = os.environ.get("SMTP_SERVER")
SMTP_PORT = int(os.environ.get("SMTP_PORT", 587))
SMTP_USERNAME = os.environ.get("SMTP_USERNAME")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL")

@app.route('/api/send-invite', methods=['POST'])
def send_invite():
    data = request.get_json()
    if not data or "email" not in data or "invite_code" not in data:
        return jsonify({"error": "Missing email or invite_code"}), 400

    recipient_email = data["email"]
    invite_code = data["invite_code"]
    app_login_link = "YOUR_APP_LOGIN_LINK"  # IMPORTANT: Replace with your app's login page

    subject = "You are invited to join!"
    body = f"""
    Hello,

    You have been invited to join our application.
    Your invite code is: {invite_code}

    Please click the following link to log in or register:
    {app_login_link}

    Thank you!
    """

    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = SENDER_EMAIL
    msg["To"] = recipient_email

    try:
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.sendmail(SENDER_EMAIL, [recipient_email], msg.as_string())
        return jsonify({"message": "Invite email sent successfully!"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# This is the entry point for Vercel
def handler(environ, start_response):
    return app(environ, start_response)
