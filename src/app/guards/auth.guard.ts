import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Auth, onAuthStateChanged } from 'firebase/auth';
import { FIREBASE_AUTH } from '../firebase.providers';
import { firstValueFrom, from } from 'rxjs';

export const authGuard: CanActivateFn = async (route, state): Promise<boolean | UrlTree> => {
  const auth = inject(FIREBASE_AUTH);
  const router = inject(Router);

  // Firebase Auth state ကို စောင့်ဆိုင်းရန် Promise ကို အသုံးပြုပါမည်။
  const user = await firstValueFrom(from(new Promise<any>(resolve => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      unsubscribe(); // ပထမဆုံး emission ရရှိသည်နှင့် ချက်ချင်း unsubscribe လုပ်ပါ
      resolve(u); // User object (သို့မဟုတ် null) ကို resolve လုပ်ပါ
    });
  })));

  // User သည် authenticated ဖြစ်ပြီး anonymous user မဟုတ်မှသာ ဝင်ရောက်ခွင့်ပြုပါ
  if (user && !user.isAnonymous) {
    return true;
  } else {
    // User သည် authenticated မဟုတ်ပါက သို့မဟုတ် anonymous user ဖြစ်ပါက /login သို့ redirect လုပ်ပါ
    return router.createUrlTree(['/login']);
  }
};
