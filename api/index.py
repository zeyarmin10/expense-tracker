
import os
from flask import Flask, request, jsonify
import sib_api_v3_sdk
from sib_api_v3_sdk.rest import ApiException

app = Flask(__name__)

# Brevo/Sendinblue API configuration
configuration = sib_api_v3_sdk.Configuration()
configuration.api_key['api-key'] = os.environ.get("BREVO_API_KEY")
api_instance = sib_api_v3_sdk.TransactionalEmailsApi(sib_api_v3_sdk.ApiClient(configuration))

SENDER_EMAIL = os.environ.get("SENDER_EMAIL")

@app.route("/api/send-invite", methods=["POST"])
def send_invite():
    data = request.get_json()
    if not data or "recipient_email" not in data:
        return jsonify({"error": "Recipient email is required"}), 400

    recipient_email = data["recipient_email"]

    subject = "You are invited to join Expense Tracker"
    html_content = f"""
    <html>
        <body>
            <h1>Invitation to Expense Tracker</h1>
            <p>You have been invited to join an expense tracking group.</p>
            <p>Please click the link below to accept the invitation:</p>
            <a href="https://expense-tracker-git-feature-google-redir-b54e30-zeyars-projects.vercel.app/onboarding?email={recipient_email}">Accept Invitation</a>
            <p>Thank you!</p>
        </body>
    </html>
    """
    sender = sib_api_v3_sdk.SendSmtpEmailSender(name="Expense Tracker", email=SENDER_EMAIL)
    to = [sib_api_v3_sdk.SendSmtpEmailTo(email=recipient_email)]

    smtp_email = sib_api_v3_sdk.SendSmtpEmail(
        sender=sender,
        to=to,
        subject=subject,
        html_content=html_content
    )

    try:
        api_response = api_instance.send_transac_email(smtp_email)
        print(api_response)
        return jsonify({"message": "Invite email sent successfully!"}), 200
    except ApiException as e:
        print(f"Error sending email: {e}")
        return jsonify({"error": "Failed to send invitation email"}), 500

@app.route("/")
def index():
    return "<h1>Python Flask API is running!</h1>"

if __name__ == "__main__":
    app.run(debug=True)
