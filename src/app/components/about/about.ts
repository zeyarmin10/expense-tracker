import { Component, inject, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { RouterModule } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { APP_VERSION } from '../../core/constants/app.constants';
import {
  LucideAngularModule,
  Wallet, PiggyBank, TrendingUp, Users, Globe, Tags, Package,
  Heart, Star, Mail, Sparkles,
} from 'lucide-angular';

interface AboutFeature {
  icon: typeof Wallet;
  titleKey: string;
  descKey: string;
}

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule, TranslateModule, RouterModule, LucideAngularModule],
  templateUrl: './about.html',
  styleUrls: ['./about.css'],
})
export class AboutComponent implements OnInit {
  private location = inject(Location);

  readonly iconSparkles = Sparkles;
  readonly iconHeart = Heart;
  readonly iconStar = Star;
  readonly iconMail = Mail;

  readonly features: AboutFeature[] = [
    { icon: Wallet, titleKey: 'ABOUT_FEATURE_EXPENSE_TITLE', descKey: 'ABOUT_FEATURE_EXPENSE_DESC' },
    { icon: PiggyBank, titleKey: 'ABOUT_FEATURE_BUDGET_TITLE', descKey: 'ABOUT_FEATURE_BUDGET_DESC' },
    { icon: TrendingUp, titleKey: 'ABOUT_FEATURE_PROFIT_TITLE', descKey: 'ABOUT_FEATURE_PROFIT_DESC' },
    { icon: Users, titleKey: 'ABOUT_FEATURE_GROUP_TITLE', descKey: 'ABOUT_FEATURE_GROUP_DESC' },
    { icon: Package, titleKey: 'ABOUT_FEATURE_INVENTORY_TITLE', descKey: 'ABOUT_FEATURE_INVENTORY_DESC' },
    { icon: Tags, titleKey: 'ABOUT_FEATURE_CURRENCY_TITLE', descKey: 'ABOUT_FEATURE_CURRENCY_DESC' },
    { icon: Globe, titleKey: 'ABOUT_FEATURE_LANGUAGE_TITLE', descKey: 'ABOUT_FEATURE_LANGUAGE_DESC' },
  ];

  // Web fallback — overridden below with the real installed version on
  // native builds. See APP_VERSION's own comment for how to keep this in
  // sync with android/app/build.gradle.
  appVersion = APP_VERSION;
  readonly currentYear = new Date().getFullYear();

  private readonly androidAppId = 'com.ethan.expensetracker';
  private readonly playStoreUrl = `https://play.google.com/store/apps/details?id=${this.androidAppId}`;
  readonly feedbackUrl = 'https://github.com/zeyarmin10/expense-tracker/issues';

  async ngOnInit(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        const info = await CapacitorApp.getInfo();
        this.appVersion = info.version;
      } catch {
        // Keep the fallback version — non-fatal.
      }
    }
  }

  goBack(): void {
    this.location.back();
  }

  openPlayStore(): void {
    if (Capacitor.getPlatform() === 'android') {
      window.open(this.playStoreUrl, '_system');
    } else {
      window.open(this.playStoreUrl, '_blank');
    }
  }
}
