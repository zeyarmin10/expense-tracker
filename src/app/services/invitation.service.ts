import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { AngularFireDatabase } from '@angular/fire/compat/database';
import { Observable, from } from 'rxjs';
import { switchMap, map } from 'rxjs/operators';
import { UserDataService } from './user-data';

@Injectable({
  providedIn: 'root'
})
export class InvitationService {

  private backendUrl = '/api'; // Use relative path for same-domain backend
  private userDataService = inject(UserDataService);

  constructor(private http: HttpClient, private db: AngularFireDatabase) { }

  /**
   * Generates a unique invitation code, stores it in the database, and returns the code.
   * @param recipientEmail The recipient's email address.
   * @param groupId The ID of the group.
   * @returns An Observable of the invitation code.
   */
  generateAndStoreInviteCode(recipientEmail: string, groupId: string): Observable<string> {
    const inviteCode = this.generateRandomCode();
    const invitation = {
      email: recipientEmail,
      groupId: groupId,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    return from(this.db.object(`invitations/${inviteCode}`).set(invitation)).pipe(
      map(() => inviteCode)
    );
  }

  /**
   * Sends a styled invitation email via the backend serverless function.
   * @param recipientEmail The recipient's email address.
   * @param inviterName The name of the person sending the invitation.
   * @param groupName The name of the group.
   * @param language The language of the inviter ('en' or 'my').
   * @param groupId The ID of the group.
   * @returns An Observable of the HTTP response.
   */
  sendInvitationEmail(recipientEmail: string, inviterName: string, groupName: string, language: string, groupId: string): Observable<any> {
    return this.generateAndStoreInviteCode(recipientEmail, groupId).pipe(
      switchMap(inviteCode => {
        const loginLink = `${window.location.origin}/login?invite_code=${inviteCode}`;
        const PrimaryBgColor = '#70BDF0'; // App's primary color
        const inviteCodeColor = '#1373BD';

        const isMyanmar = language === 'my';

        const subject = isMyanmar
          ? `${groupName} သို့ Expense Tracker တွင် ပါဝင်ရန် သင့်အား ဖိတ်ခေါ်ပါသည်။`
          : `You're invited to join ${groupName} on Expense Tracker`;

        const texts = {
          title: isMyanmar ? 'သင့်ကို ဖိတ်ခေါ်ထားပါတယ်' : 'You\'re Invited!',
          greeting: isMyanmar ? 'မင်္ဂလာပါ,' : 'Hi,',
          body1: isMyanmar
            ? `${inviterName} မှ သင့်အား Expense Tracker ရှိ သူတို့၏အဖွဲ့ <strong>"${groupName}"</strong> သို့ ဖိတ်ခေါ်ထားပါသည်။`
            : `${inviterName} has invited you to join their group, <strong>"${groupName}"</strong>, on Expense Tracker.`,
          body2: isMyanmar
            ? 'ဖိတ်ခေါ်ချက်ကို လက်ခံပြီး အသုံးစရိတ်များကို အတူတကွ ခြေရာခံရန် အောက်ပါခလုတ်ကို နှိပ်ပါ။'
            : 'To accept the invitation and start tracking expenses together, click the button below:',
          button: isMyanmar ? 'အဖွဲ့သို့ဝင်ရောက်ပါ' : 'Join the Group',
          body3: isMyanmar
            ? 'သို့မဟုတ်၊ သင်၏ browser တွင် ဤလင့်ခ်ကို ကူးထည့်နိုင်သည်:'
            : 'If the button doesn\'t work, you can also copy and paste this link into your browser:',
          body4: isMyanmar
            ? 'ဖိတ်ခေါ်ကုဒ်ကို အသုံးပြု၍လည်း ဝင်ရောက်နိုင်ပါသည်:'
            : 'Or, you can use the invitation code:',
          footer: isMyanmar
            ? 'သင်သည် ဤဖိတ်ခေါ်ချက်ကို မမျှော်လင့်ထားပါက၊ ဤအီးမေးလ်ကို လျစ်လျူရှုနိုင်ပါသည်။'
            : 'If you did not expect this invitation, you can safely ignore this email.',
        };

        const htmlBody = `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 20px auto; border: 1px solid #ddd; border-radius: 12px; overflow: hidden;">
            <div style="background-color: ${PrimaryBgColor}; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0; font-size: 28px;">Expense Tracker</h1>
            </div>
            <div style="padding: 25px 30px;">
              <h2 style="font-size: 22px; color: #333;">${texts.title}</h2>
              <p style="font-size: 16px;">${texts.greeting}</p>
              <p style="font-size: 16px;">${texts.body1}</p>
              <p style="font-size: 16px;">${texts.body2}</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${loginLink}" style="background-color: ${PrimaryBgColor}; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-size: 18px; display: inline-block;">${texts.button}</a>
              </div>
              <p style="font-size: 16px;">${texts.body4}</p>
              <p style="font-size: 20px; font-weight: bold; text-align: center; letter-spacing: 2px; color: ${inviteCodeColor}; background-color: ${PrimaryBgColor};">${inviteCode}</p>
              <p style="font-size: 16px; margin-top: 20px;">${texts.body3}</p>
              <p style="font-size: 14px; color: #555; word-break: break-all;">${loginLink}</p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
              <p style="font-size: 12px; color: #999;">${texts.footer}</p>
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
      })
    );
  }

  private generateRandomCode(): string {
    const length = 8;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}
