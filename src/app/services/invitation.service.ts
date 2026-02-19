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
      email: email,
      invite_code: inviteCode
    };
    return this.http.post(`${this.backendUrl}/send-invite`, body);
  }
}
