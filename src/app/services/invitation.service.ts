import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class InvitationService {

  private backendUrl = '/api'; // Use relative path for same-domain backend

  constructor(private http: HttpClient) { }

  /**
   * Sends an invitation email via the backend serverless function.
   * @param email The recipient's email address.
   * @param inviteCode The group invitation code.
   * @returns An Observable of the HTTP response.
   */
  sendInvitationEmail(email: string, inviteCode: string): Observable<any> {
    const body = {
      to: email,
      // ERROR: Do not use a public email address like @gmail.com here.
      // You MUST use an email from a domain you have verified in your Resend account.
      from: 'invites@your-verified-domain.com', 
      subject: 'You are invited to join a group!',
      html: `You have been invited to join a group. Your invite code is ${inviteCode}`
    };
    return this.http.post(this.backendUrl, body);
  }
}
