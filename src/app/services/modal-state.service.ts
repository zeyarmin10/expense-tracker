import { Injectable } from '@angular/core';

/**
 * Lets an in-page modal on a route that the Android hardware back button
 * treats as "exit the app" (dashboard/login/onboarding — see app.ts's
 * initBackButton) announce that it's open, so back closes the modal instead
 * of exiting. A counter (not a boolean) so nested/overlapping modals can't
 * clear each other's open state early.
 */
@Injectable({
  providedIn: 'root',
})
export class ModalStateService {
  private openCount = 0;

  get isModalOpen(): boolean {
    return this.openCount > 0;
  }

  modalOpened(): void {
    this.openCount += 1;
  }

  modalClosed(): void {
    this.openCount = Math.max(0, this.openCount - 1);
  }
}
