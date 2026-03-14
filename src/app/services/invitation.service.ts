import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { AngularFireDatabase } from '@angular/fire/compat/database';
import { Observable, from } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { Capacitor } from '@capacitor/core';

export interface Invitation {
  email: string;
  groupId: string;
  status: 'pending' | 'accepted';
  createdAt: string;
  acceptedBy?: string;
  acceptedAt?: string;
}

const VERCEL_URL = 'https://expense-tracker-mocha-omega.vercel.app';

@Injectable({
  providedIn: 'root'
})
export class InvitationService {

  constructor(private http: HttpClient, private db: AngularFireDatabase) { }

  private get apiUrl(): string {
    if (Capacitor.isNativePlatform()) {
      return `${VERCEL_URL}/api`;  // Android/iOS → full URL
    }
    return '/api';                  // Web browser → relative URL
  }

  private get appUrl(): string {
    if (Capacitor.isNativePlatform()) {
      return VERCEL_URL;            // Android/iOS → email link က web URL ဖြစ်မယ်
    }
    return window.location.origin;  // Web → current domain
  }

  getInvitation(code: string): Observable<Invitation | null> {
    return this.db.object<Invitation>(`invitations/${code}`).valueChanges();
  }

  sendInvitationEmail(
    recipientEmail: string,
    inviterName: string,
    groupName: string,
    language: string,
    groupId: string
  ): Observable<any> {

    const inviteCode = this.generateRandomCode();
    const loginLink = `${this.appUrl}/login?invite_code=${inviteCode}`;

    const PrimaryBgColor = '#70BDEF';
    const PrimaryTxtColor = '#1172BD';
    const PrimaryBtnBgColor = '#70BDF0';
    const inviteCodeBgColor = '#e0e0e0';
    const isMyanmar = language === 'my';

    const subject = isMyanmar
      ? `${groupName} သို့ Expense Tracker တွင် ပါဝင်ရန် သင့်အား ဖိတ်ခေါ်ပါသည်။`
      : `You're invited to join ${groupName} on Expense Tracker`;

    const texts = {
      title:    isMyanmar ? 'သင့်ကို ဖိတ်ခေါ်ထားပါတယ်' : "You're Invited!",
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
        : "If the button doesn't work, you can also copy and paste this link into your browser:",
      body4: isMyanmar
        ? 'ဖိတ်ခေါ်ကုဒ်ကို အသုံးပြု၍လည်း ဝင်ရောက်နိုင်ပါသည်:'
        : 'Or, you can use the invitation code:',
      body5: isMyanmar
        ? 'ကျေးဇူးပြု၍ မှတ်သားထားပါ - ဤဖိတ်ခေါ်ကုဒ်သည် တစ်ကြိမ်သာ အသုံးပြုရန်ဖြစ်ပါသည်။'
        : 'Please note: This invitation code is for one-time use only.',
      footer: isMyanmar
        ? 'သင်သည် ဤဖိတ်ခေါ်ချက်ကို မမျှော်လင့်ထားပါက၊ ဤအီးမေးလ်ကို လျစ်လျူရှုနိုင်ပါသည်။'
        : 'If you did not expect this invitation, you can safely ignore this email.',
    };

    const htmlBody = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 20px auto; border: 1px solid #ddd; border-radius: 12px; overflow: hidden;">
      <div style="background-color: ${PrimaryBgColor}; color: ${PrimaryTxtColor}; padding: 20px; text-align: center;">
        <h1 style="margin: 0; font-size: 28px;">Expense Tracker</h1>
      </div>
      <div style="padding: 25px 30px;">
        <h2 style="font-size: 22px; color: #333;">${texts.title}</h2>
        <p style="font-size: 16px;">${texts.greeting}</p>
        <p style="font-size: 16px;">${texts.body1}</p>
        <p style="font-size: 16px;">${texts.body2}</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${loginLink}" style="background-color: ${PrimaryBtnBgColor}; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-size: 18px; display: inline-block;">${texts.button}</a>
        </div>
        <p style="font-size: 16px;">${texts.body4}</p>
        <p style="font-size: 20px; font-weight: bold; text-align: center; letter-spacing: 5px; color: black; background-color: ${inviteCodeBgColor}; border-radius: 8px; padding: 10px 20px;">${inviteCode}</p>
        <p style="font-size: 14px; color: #D2042D; text-align: center; margin-top: 5px;">${texts.body5}</p>
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

    const emailPayload = { to: recipientEmail, subject, html: htmlBody };

    return this.http.post(this.apiUrl, emailPayload).pipe(
      switchMap(() => {
        const invitation: Omit<Invitation, 'acceptedBy' | 'acceptedAt'> = {
          email: recipientEmail,
          groupId,
          status: 'pending',
          createdAt: new Date().toISOString()
        };
        return from(this.db.object(`invitations/${inviteCode}`).set(invitation));
      })
    );
  }

  private generateRandomCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 8 }, () =>
      chars.charAt(Math.floor(Math.random() * chars.length))
    ).join('');
  }
}
