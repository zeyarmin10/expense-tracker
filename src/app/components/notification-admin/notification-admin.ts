import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faBell, faPaperPlane, faShieldHalved } from '@fortawesome/free-solid-svg-icons';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-notification-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, FontAwesomeModule, TranslateModule],
  templateUrl: './notification-admin.html',
  styleUrls: ['./notification-admin.css'],
})
export class NotificationAdminComponent {
  private readonly notificationService = inject(NotificationService);
  private readonly translate = inject(TranslateService);

  faBell = faBell;
  faPaperPlane = faPaperPlane;
  faShieldHalved = faShieldHalved;

  adminSecret = '';
  title = 'Expense Tracker';
  body = '';
  link = '/expense';
  targetUid = '';
  isSending = false;
  resultMessage = '';
  errorMessage = '';

  async sendNotification(): Promise<void> {
    if (!this.adminSecret.trim() || !this.title.trim() || !this.body.trim()) {
      this.errorMessage = this.translate.instant('NOTI_ADMIN_REQUIRED_ERROR');
      this.resultMessage = '';
      return;
    }

    this.isSending = true;
    this.errorMessage = '';
    this.resultMessage = '';

    try {
      const result = await this.notificationService.sendDeveloperNotification({
        adminSecret: this.adminSecret.trim(),
        title: this.title.trim(),
        body: this.body.trim(),
        link: this.link.trim() || '/expense',
        targetUid: this.targetUid.trim() || undefined,
      });

      this.resultMessage = this.translate.instant('NOTI_ADMIN_SENT_RESULT', {
        sent: result.sent,
        failed: result.failed,
      });
    } catch (error: any) {
      this.errorMessage =
        error?.error?.details ||
        error?.error?.error ||
        error?.message ||
        this.translate.instant('NOTI_ADMIN_SEND_ERROR');
    } finally {
      this.isSending = false;
    }
  }
}
