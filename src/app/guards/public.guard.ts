import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Auth, onAuthStateChanged } from 'firebase/auth';
import { FIREBASE_AUTH } from '../firebase.providers';
import { firstValueFrom, from } from 'rxjs';

// Canvas environment မှ global variables များကို ကြေညာပါ (ဤနေရာတွင် တိုက်ရိုက်အသုံးမပြုသော်လည်း ရှိနေပါစေ)
declare const __initial_auth_token: string;

export const publicGuard: CanActivateFn = async (route, state): Promise<boolean | UrlTree> => {
  const auth = inject(FIREBASE_AUTH);
  const router = inject(Router);

  // Firebase Auth state ကို စောင့်ဆိုင်းရန် Promise ကို အသုံးပြုပါမည်။
  // ၎င်းသည် Firebase မှ user session ကို စစ်ဆေးပြီးသည်အထိ guard ကို block လုပ်ထားပါမည်။
  const user = await firstValueFrom(from(new Promise<any>(resolve => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      unsubscribe(); // ပထမဆုံး emission ရရှိသည်နှင့် ချက်ချင်း unsubscribe လုပ်ပါ
      resolve(u); // User object (သို့မဟုတ် null) ကို resolve လုပ်ပါ
    });
  })));

  // user ရှိပြီး anonymous user မဟုတ်ဘူးဆိုရင် (ဥပမာ: Google ဖြင့် login ဝင်ထားသော user)
  // /expense သို့ redirect လုပ်ပါမည်။
  // Canvas environment မှ __initial_auth_token ကြောင့် အလိုအလျောက် anonymous login ဝင်နေခြင်းကို ရှောင်ရှားရန် user.isAnonymous ကို စစ်ဆေးပါသည်။
  if (user && !user.isAnonymous) {
    console.log('Public Guard: User is authenticated and not anonymous, redirecting to /expense.');
    return router.createUrlTree(['/expense']);
  } else {
    // user မရှိပါက သို့မဟုတ် anonymous user ဖြစ်ပါက /login page သို့ ဝင်ရောက်ခွင့်ပြုပါမည်။
    // ဤနေရာတွင် user သည် Google ဖြင့် login ဝင်ရန် လိုအပ်ပါသည်။
    console.log('Public Guard: User is not authenticated or is anonymous, allowing access to /login.');
    return true;
  }
};
