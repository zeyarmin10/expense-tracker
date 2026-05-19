import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export type AppTheme = 'light' | 'dark' | 'system';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private readonly appThemeKey = 'appTheme';
  private readonly legacyThemeKey = 'theme';
  private systemDarkQuery: MediaQueryList | null = null;
  private systemThemeListener: ((event: MediaQueryListEvent) => void) | null = null;

  private readonly themeSubject = new BehaviorSubject<AppTheme>(this.getStoredTheme());
  private readonly isDarkModeSubject = new BehaviorSubject<boolean>(true);

  readonly theme$: Observable<AppTheme> = this.themeSubject.asObservable();
  readonly isDarkMode$: Observable<boolean> = this.isDarkModeSubject.asObservable();

  constructor() {
    this.applyTheme(this.themeSubject.value);
  }

  get currentTheme(): AppTheme {
    return this.themeSubject.value;
  }

  get isDarkMode(): boolean {
    return this.isDarkModeSubject.value;
  }

  setTheme(theme: AppTheme): void {
    localStorage.setItem(this.appThemeKey, theme);
    this.applyTheme(theme);
  }

  toggleTheme(): AppTheme {
    const nextTheme: AppTheme = this.isDarkMode ? 'light' : 'dark';
    this.setTheme(nextTheme);
    return nextTheme;
  }

  private getStoredTheme(): AppTheme {
    const savedAppTheme = localStorage.getItem(this.appThemeKey);
    if (this.isAppTheme(savedAppTheme)) {
      return savedAppTheme;
    }

    const legacyTheme = localStorage.getItem(this.legacyThemeKey);
    if (legacyTheme === 'light' || legacyTheme === 'dark') {
      return legacyTheme;
    }

    return 'system';
  }

  private applyTheme(theme: AppTheme): void {
    this.removeSystemThemeListener();
    this.themeSubject.next(theme);

    if (theme === 'system') {
      this.systemDarkQuery = window.matchMedia('(prefers-color-scheme: dark)');
      this.applyResolvedTheme(this.systemDarkQuery.matches);
      this.systemThemeListener = (event: MediaQueryListEvent) => {
        this.applyResolvedTheme(event.matches);
      };
      this.systemDarkQuery.addEventListener('change', this.systemThemeListener);
      return;
    }

    this.applyResolvedTheme(theme === 'dark');
  }

  private applyResolvedTheme(isDark: boolean): void {
    this.isDarkModeSubject.next(isDark);
    document.body.classList.toggle('light-mode', !isDark);
    localStorage.setItem(this.legacyThemeKey, isDark ? 'dark' : 'light');
  }

  private removeSystemThemeListener(): void {
    if (this.systemDarkQuery && this.systemThemeListener) {
      this.systemDarkQuery.removeEventListener('change', this.systemThemeListener);
    }
    this.systemDarkQuery = null;
    this.systemThemeListener = null;
  }

  private isAppTheme(value: string | null): value is AppTheme {
    return value === 'light' || value === 'dark' || value === 'system';
  }
}
