import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Observable, of, map, firstValueFrom } from 'rxjs';
import { switchMap, tap, catchError } from 'rxjs/operators';
import { AuthService } from '../../services/auth';
// Assuming UserProfile now includes a 'currency' property
import { UserDataService, UserProfile } from '../../services/user-data';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faSave, faUserCircle } from '@fortawesome/free-solid-svg-icons';
import { updateProfile } from '@angular/fire/auth';
import { User } from '@angular/fire/auth';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    FontAwesomeModule,
    FormsModule,
  ],
  providers: [DatePipe],
  templateUrl: './user-profile.html',
  styleUrls: ['./user-profile.css'],
})
export class UserProfileComponent implements OnInit {
  private authService = inject(AuthService);
  private userDataService = inject(UserDataService);
  private fb = inject(FormBuilder);
  private translate = inject(TranslateService);
  private datePipe = inject(DatePipe);

  userProfileForm: FormGroup;
  userDisplayData$: Observable<{
    email: string | null;
    createdAt: string | null;
    currency?: string; // Add currency to this type
  } | null>;
  userPhotoUrl$: Observable<string | null>;

  errorMessage: string | null = null;
  successMessage: string | null = null;
  selectedLanguage: string = 'my';
  selectedCurrency: string = 'MMK';

  // ✅ NEW: Available currencies for the dropdown
  availableCurrencies = [
    { code: 'MMK', symbol: 'Ks' },
    { code: 'USD', symbol: '$' },
    { code: 'THB', symbol: '฿' },
    { code: 'EUR', symbol: '€' },
    { code: 'JPY', symbol: '¥' },
    { code: 'GBP', symbol: '£' },
    { code: 'SGD', symbol: 'S$' },
    { code: 'KHR', symbol: '៛' },
  ];

  faSave = faSave;
  faUserCircle = faUserCircle;

  imageLoadError: boolean = false;

  constructor() {
    // ✅ FIX: Add 'currency' as a form control with a default value
    this.userProfileForm = this.fb.group({
      displayName: ['', Validators.maxLength(50)],
      currency: ['MMK', Validators.required],
    });

    this.userDisplayData$ = this.authService.currentUser$.pipe(
      switchMap((user) => {
        if (user && user.uid) {
          return this.userDataService.getUserProfile(user.uid).pipe(
            tap((profile) => {
              const currentDisplayName =
                profile?.displayName || user.displayName || '';
              const currentCurrency = profile?.currency || 'MMK';
              this.userProfileForm.patchValue({
                displayName: currentDisplayName,
                currency: currentCurrency,
              });

              // ✅ NEW: Set selectedCurrency from profile or default
              this.selectedCurrency = profile?.currency || 'MMK';

              if (!profile) {
                // If no profile exists, create one with default currency
                this.userDataService
                  .createUserProfile({
                    uid: user.uid,
                    email: user.email || '',
                    displayName: user.displayName || '',
                    createdAt:
                      user.metadata.creationTime || new Date().toISOString(),
                    currency: this.selectedCurrency, // Add default currency
                  })
                  .catch((err) =>
                    console.error('Error creating initial user profile:', err)
                  );
              }
            }),
            map((profile) => {
              const email = profile?.email || user.email || 'N/A';
              const createdAt =
                profile?.createdAt ||
                user.metadata.creationTime ||
                new Date().toISOString();

              const currency = profile?.currency || 'MMK'; // Pass currency in map

              return { email, createdAt, currency };
            }),
            catchError((err) => {
              console.error('Error fetching user profile data:', err);
              this.errorMessage = this.translate.instant('PROFILE_FETCH_ERROR');
              return of(null);
            })
          );
        }
        // Handle no user logged in case
        this.userProfileForm.patchValue({ displayName: '', currency: 'MMK' });
        return of(null);
      })
    );

    this.userPhotoUrl$ = this.authService.currentUser$.pipe(
      map((user) => {
        this.imageLoadError = false;
        if (
          user?.photoURL &&
          typeof user.photoURL === 'string' &&
          user.photoURL.length > 0
        ) {
          return user.photoURL;
        }
        return null;
      })
    );
  }

  ngOnInit(): void {
    const storedLang = localStorage.getItem('selectedLanguage');
    if (storedLang) {
      this.selectedLanguage = storedLang;
      this.translate.use(storedLang);
    } else {
      this.selectedLanguage = this.translate.getBrowserLang() || 'en';
      this.translate.use(this.selectedLanguage);
    }
  }

  onLanguageChange(language: string): void {
    this.selectedLanguage = language;
    this.translate.use(this.selectedLanguage);
    localStorage.setItem('selectedLanguage', this.selectedLanguage);
    // You might want to persist the language to the user profile here as well,
    // if it's considered a user setting that syncs across devices.
    // e.g., this.userDataService.updateUserProfile(currentUser.uid, { language: this.selectedLanguage });
  }

  onImageError(): void {
    console.log('Profile image failed to load. Displaying default icon.');
    this.imageLoadError = true;
  }

  async onSubmit(): Promise<void> {
    this.errorMessage = null;
    this.successMessage = null;

    if (this.userProfileForm.valid && this.userProfileForm.dirty) {
      const currentUser = await firstValueFrom(this.authService.currentUser$);

      if (currentUser && currentUser.uid) {
        const displayName = this.userProfileForm.get('displayName')?.value;
        const currency = this.userProfileForm.get('currency')?.value;
        try {
          if (
            currentUser.displayName !== displayName &&
            displayName !== null &&
            displayName !== undefined
          ) {
            await updateProfile(currentUser, { displayName: displayName });
          }

          // ✅ REVISED: Include currency in the update if it changes (though it's disabled in UI)
          // If you decide to make it editable later, this is where you'd save it.
          await this.userDataService.updateUserProfile(currentUser.uid, {
            displayName: displayName,
            currency: currency, // Save the selected currency
          });

          this.successMessage = this.translate.instant(
            'PROFILE_UPDATE_SUCCESS'
          );
          this.userProfileForm.markAsPristine();
        } catch (error: any) {
          console.error('Error updating profile:', error);
          this.errorMessage =
            error.message || this.translate.instant('PROFILE_UPDATE_ERROR');
        }
      } else {
        this.errorMessage = this.translate.instant('AUTH_ERROR_PROFILE_UPDATE');
      }
    } else {
      if (this.userProfileForm.invalid) {
        this.errorMessage = this.translate.instant('INVALID_FORM_PROFILE');
      } else if (!this.userProfileForm.dirty) {
        this.errorMessage = this.translate.instant('NO_CHANGES_TO_SAVE');
      }
    }
  }

  formatLocalizedDate(
    date: string | Date | null | undefined,
    format: string
  ): string {
    const currentLang = this.translate.currentLang;
    return this.datePipe.transform(date, format, undefined, currentLang) || '';
  }
}
