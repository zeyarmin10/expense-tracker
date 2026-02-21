import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { UserDataService } from './user-data';

@Injectable({
  providedIn: 'root'
})
export class InvitationService {

  private backendUrl = '/api'; // Use relative path for same-domain backend
  private userDataService = inject(UserDataService);

  constructor(private http: HttpClient) { }

  /**
   * Sends a styled invitation email via the backend serverless function.
   * @param recipientEmail The recipient's email address.
   * @param inviteCode The group invitation code.
   * @param inviterName The name of the person sending the invitation.
   * @param groupName The name of the group.
   * @returns An Observable of the HTTP response.
   */
  sendInvitationEmail(recipientEmail: string, inviteCode: string, inviterName: string, groupName: string): Observable<any> {
    
    // Construct the correct login link with invite_code parameter
    const loginLink = `${window.location.origin}/login?invite_code=${inviteCode}`;

    const subject = `You're invited to join ${groupName} on Expense Tracker`;

    // Modern HTML email template
    const htmlBody = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 20px auto; border: 1px solid #ddd; border-radius: 12px; overflow: hidden;">
        <div style="background-color: #4CAF50; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 28px;">Expense Tracker</h1>
        </div>
        <div style="padding: 25px 30px;">
          <h2 style="font-size: 22px; color: #333;">You're Invited!</h2>
          <p style="font-size: 16px;">Hello,</p>
          <p style="font-size: 16px;">${inviterName} has invited you to join their group, <strong>"${groupName}"</strong>, on Expense Tracker.</p>
          <p style="font-size: 16px;">To accept the invitation and start tracking expenses together, click the button below:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${loginLink}" style="background-color: #4CAF50; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-size: 18px; display: inline-block;">Join the Group</a>
          </div>
          <p style="font-size: 16px;">If the button doesn't work, you can also copy and paste this link into your browser:</p>
          <p style="font-size: 14px; color: #555; word-break: break-all;">${loginLink}</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #999;">If you did not expect this invitation, you can safely ignore this email.</p>
        </div>
        <div style="background-color: #f7f7f7; color: #888; padding: 15px; text-align: center; font-size: 12px;">
          &copy; ${new Date().getFullYear()} Expense Tracker. All Rights Reserved.
        </div>
      </div>
    `;

    const body = {
      to: recipientEmail,
      subject: subject,
      html: htmlBody
    };
    
    return this.http.post(this.backendUrl, body);
  }
}
