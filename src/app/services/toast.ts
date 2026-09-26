import { Injectable } from '@angular/core';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Toast as NativeToast } from '@capacitor/toast';
import Swal, { SweetAlertIcon, SweetAlertOptions } from 'sweetalert2';

interface AppToastPlugin {
  show(options: {
    text: string;
    duration?: 'short' | 'long';
    kind?: string;
    bottomOffsetDp?: number;
  }): Promise<void>;
}

const AppToast = registerPlugin<AppToastPlugin>('AppToast');

const SwalToast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  showCloseButton: true,
  timer: 3000,
  timerProgressBar: true,
  customClass: { popup: 'colored-toast' },
  didOpen: (toast) => {
    toast.addEventListener('mouseenter', Swal.stopTimer);
    toast.addEventListener('mouseleave', Swal.resumeTimer);
  },
});

type AppToastOptions = Pick<SweetAlertOptions, 'icon' | 'title' | 'text'>;

export async function showAppToast(
  message: string,
  icon: SweetAlertIcon = 'info',
): Promise<void> {
  const normalizedMessage = String(message || '').trim();
  if (!normalizedMessage) {
    return;
  }

  if (Capacitor.isNativePlatform()) {
    const duration = icon === 'error' || icon === 'warning' ? 'long' : 'short';

    try {
      if (Capacitor.getPlatform() === 'android') {
        await AppToast.show({
          text: normalizedMessage,
          duration,
          kind: icon,
          bottomOffsetDp: 150,
        });
        return;
      }

      await NativeToast.show({
        text: normalizedMessage,
        duration,
        position: 'bottom',
      });
      return;
    } catch (error) {
      console.warn('[toast] Native toast failed; falling back to web toast.', error);
    }
  }

  await SwalToast.fire({ icon, title: normalizedMessage });
}

export function createAppToast() {
  return {
    fire(options: AppToastOptions): Promise<void> {
      const title = typeof options.title === 'string' ? options.title : '';
      const text = typeof options.text === 'string' ? options.text : '';
      return showAppToast(title || text, options.icon as SweetAlertIcon || 'info');
    },
  };
}

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  showSuccess(message: string): void {
    void showAppToast(message, 'success');
  }

  showError(message: string): void {
    void showAppToast(message, 'error');
  }

  showWarning(message: string): void {
    void showAppToast(message, 'warning');
  }

  showInfo(message: string): void {
    void showAppToast(message, 'info');
  }
}
