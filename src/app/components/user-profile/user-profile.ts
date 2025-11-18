import { Component, OnInit, inject, ViewChild } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Observable, of, map, firstValueFrom, from } from 'rxjs';
import { switchMap, tap, catchError } from 'rxjs/operators';
import { AuthService } from '../../services/auth';
import { UserDataService, UserProfile } from '../../services/user-data';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faSave, faUserCircle, faTrash, faPlus, faChevronDown, faChevronUp, faListUl } from '@fortawesome/free-solid-svg-icons';
import { updateProfile } from '@angular/fire/auth';
import { User } from '@angular/fire/auth';
import { FormsModule } from '@angular/forms';
import { AVAILABLE_CURRENCIES } from '../../core/constants/app.constants';
import { CustomBudgetPeriodModalComponent } from '../common/custom-budget-period-modal/custom-budget-period-modal.component';
import { CustomBudgetPeriod, CustomBudgetPeriodService } from '../../services/custom-budget-period.service';
import { ConfirmationModal } from '../common/confirmation-modal/confirmation-modal';
import { ToastService } from '../../services/toast';

export const AVAILABLE_BUDGET_PERIODS = [
  { code: null, nameKey: 'BUDGET_PERIOD.NONE' },
  { code: 'weekly', nameKey: 'BUDGET_PERIOD.WEEKLY' },
  { code: 'monthly', nameKey: 'BUDGET_PERIOD.MONTHLY' },
  { code: 'yearly', nameKey: 'BUDGET_PERIOD.YEARLY' },
];

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    FontAwesomeModule,
    FormsModule,
    CustomBudgetPeriodModalComponent,
    ConfirmationModal
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
  private customBudgetPeriodService = inject(CustomBudgetPeriodService);
  private toastService = inject(ToastService);

  userProfileForm: FormGroup;
  userDisplayData$: Observable<any>;
  userPhotoUrl$: Observable<string | null>;

  selectedLanguage: string = 'my';
  selectedCurrency: string = 'MMK';
  selectedBudgetPeriod: string | null = null;
  availableBudgetPeriods = AVAILABLE_BUDGET_PERIODS;
  translatedBudgetPeriods: any[] = [];
  availableCurrencies = AVAILABLE_CURRENCIES;
  translatedCurrencies: any[] = [];
  customBudgetPeriods: CustomBudgetPeriod[] = [];
  showCustomDateRange = false;
  isCustomBudgetListCollapsed = true;
  
  // For confirmation modal
  @ViewChild(ConfirmationModal) private confirmationModal!: ConfirmationModal;
  periodToDeleteId: string | null = null;
  confirmationTitle: string = '';
  confirmationMessage: string = '';
  confirmButtonText: string = '';
  cancelButtonText: string = '';


  get isCustomPeriodSelected(): boolean {
    const selectedPeriodId = this.userProfileForm.get('budgetPeriod')?.value;
    if (!selectedPeriodId) {
      return false;
    }
    return this.customBudgetPeriods.some(p => p.id === selectedPeriodId);
  }

  @ViewChild(CustomBudgetPeriodModalComponent) private modalComponent!: CustomBudgetPeriodModalComponent;
  
  faPlus = faPlus;
  faSave = faSave;
  faUserCircle = faUserCircle;
  faTrash = faTrash;
  faChevronDown = faChevronDown;
  faChevronUp = faChevronUp;
  imageLoadError: boolean = false;
  faListUl = faListUl;

  constructor() {
    this.userProfileForm = this.fb.group({
      displayName: ['', Validators.maxLength(50)],
      currency: ['MMK', Validators.required],
      budgetPeriod: [null],
      budgetStartDate: [{ value: null, disabled: true }],
      budgetEndDate: [{ value: null, disabled: true }],
    });

    this.userDisplayData$ = this.authService.currentUser$.pipe(
      switchMap((user) => {
        if (user && user.uid) {
          return from(this.userDataService.getUserProfile(user.uid)).pipe(
            tap((profile) => {
              this.userProfileForm.patchValue({
                displayName: profile?.displayName || user.displayName || '',
                currency: profile?.currency || 'MMK',
                budgetPeriod: profile?.selectedBudgetPeriodId || profile?.budgetPeriod || null,
                budgetStartDate: profile?.budgetStartDate || null,
                budgetEndDate: profile?.budgetEndDate || null,
              });
              this.selectedCurrency = profile?.currency || 'MMK';

              // This will now correctly handle the 'custom' case on load
              this.handleBudgetPeriodChange(this.userProfileForm.get('budgetPeriod')?.value, true);
            }),
            map((profile) => ({
              email: profile?.email || user.email || 'N/A',
              createdAt: profile?.createdAt || user.metadata.creationTime || new Date().toISOString(),
              currency: profile?.currency || 'MMK',
              budgetPeriod: profile?.budgetPeriod || null,
              budgetStartDate: profile?.budgetStartDate || null,
              budgetEndDate: profile?.budgetEndDate || null,
            })),
            catchError((err) => {
              console.error('Error fetching user profile data:', err);
              this.toastService.showError(this.translate.instant('PROFILE_FETCH_ERROR'));
              return of(null);
            })
          );
        }
        return of(null);
      })
    );

    this.userPhotoUrl$ = this.authService.currentUser$.pipe(
      map((user) => {
        this.imageLoadError = false;
        return user?.photoURL || null;
      })
    );

    this.userProfileForm.get('budgetPeriod')?.valueChanges.subscribe((periodId) => {
        this.handleBudgetPeriodChange(periodId);
    });
  }

  ngOnInit(): void {
    const storedLang = localStorage.getItem('selectedLanguage');
    if (storedLang) {
      this.selectedLanguage = storedLang;
      this.translate.use(storedLang);
    } else {
      this.selectedLanguage = this.translate.getBrowserLang() || 'my';
      this.translate.use(this.selectedLanguage);
    }

    this.translate.onLangChange.subscribe(() => {
      this.translateCurrencyNames();
      this.translateBudgetPeriodNames();
    });

    this.translateCurrencyNames();
    this.translateBudgetPeriodNames();

    this.authService.currentUser$.subscribe(user => {
      if (user) {
        this.customBudgetPeriodService.getCustomBudgetPeriods(user.uid).subscribe(periods => {
          this.customBudgetPeriods = periods.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
          // Re-evaluate after custom periods are loaded
          this.handleBudgetPeriodChange(this.userProfileForm.get('budgetPeriod')?.value, true);
        });
      }
    });
  }
  
  translateCurrencyNames() {
    this.translatedCurrencies = this.availableCurrencies.map((currency) => ({
        ...currency,
        name: this.translate.instant('CURRENCY_NAMES.' + currency.code),
      }));
  }

  translateBudgetPeriodNames() {
    this.translatedBudgetPeriods = this.availableBudgetPeriods.map((period) => ({
        ...period,
        name: this.translate.instant(period.nameKey),
      }));
  }

  handleBudgetPeriodChange(periodId: string | null, isInitialLoad = false): void {
    const startDateControl = this.userProfileForm.get('budgetStartDate');
    const endDateControl = this.userProfileForm.get('budgetEndDate');

    if (isInitialLoad && periodId === 'custom') {
      const savedStartDate = this.userProfileForm.get('budgetStartDate')?.value;
      const savedEndDate = this.userProfileForm.get('budgetEndDate')?.value;
      const matchingCustomPeriod = this.customBudgetPeriods.find(p => p.startDate === savedStartDate && p.endDate === savedEndDate);
      if (matchingCustomPeriod) {
        // Set the dropdown to the correct custom period ID
        this.userProfileForm.get('budgetPeriod')?.setValue(matchingCustomPeriod.id, { emitEvent: false });
        periodId = matchingCustomPeriod.id ?? null; // Continue with the correct ID
      }
    } else if (isInitialLoad && this.userProfileForm.get('budgetPeriod')?.value) {
      periodId = this.userProfileForm.get('budgetPeriod')?.value;
    }

    const customPeriod = this.customBudgetPeriods.find(p => p.id === periodId);

    if (customPeriod) {
      this.showCustomDateRange = true;
      startDateControl?.enable();
      endDateControl?.enable();
      startDateControl?.setValue(customPeriod.startDate);
      endDateControl?.setValue(customPeriod.endDate);
      startDateControl?.disable();
      endDateControl?.disable();
    } else {
      this.showCustomDateRange = false;
      if (!isInitialLoad) {
          startDateControl?.setValue(null);
          endDateControl?.setValue(null);
      }
    }
  }
  
  onLanguageChange(language: string): void {
    this.selectedLanguage = language;
    this.translate.use(this.selectedLanguage);
    localStorage.setItem('selectedLanguage', this.selectedLanguage);
  }

  onImageError(): void {
    console.log('Profile image failed to load. Displaying default icon.');
    this.imageLoadError = true;
  }

  async onSubmit(): Promise<void> {
    if (this.userProfileForm.valid && this.userProfileForm.dirty) {
      const currentUser = await firstValueFrom(this.authService.currentUser$);
      if (currentUser && currentUser.uid) {
        const formValues = this.userProfileForm.getRawValue();
        const isCustom = this.customBudgetPeriods.some(p => p.id === formValues.budgetPeriod);

        const profileData: Partial<UserProfile> = {
          displayName: formValues.displayName,
          currency: formValues.currency,
          budgetPeriod: isCustom ? 'custom' : formValues.budgetPeriod,
          budgetStartDate: isCustom ? formValues.budgetStartDate : null,
          budgetEndDate: isCustom ? formValues.budgetEndDate : null,
          selectedBudgetPeriodId: isCustom ? formValues.budgetPeriod : null
        };

        try {
          if (currentUser.displayName !== profileData.displayName) {
            await updateProfile(currentUser, { displayName: profileData.displayName });
          }

          await this.userDataService.updateUserProfile(currentUser.uid, profileData);

          this.toastService.showSuccess(this.translate.instant('PROFILE_UPDATE_SUCCESS'));
          this.userProfileForm.markAsPristine();
        } catch (error: any) {
          console.error('Error updating profile:', error);
          this.toastService.showError(error.message || this.translate.instant('PROFILE_UPDATE_ERROR'));
        }
      } else {
        this.toastService.showError(this.translate.instant('AUTH_ERROR_PROFILE_UPDATE'));
      }
    } else if (this.userProfileForm.invalid) {
        this.toastService.showError(this.translate.instant('INVALID_FORM_PROFILE'));
    } else if (!this.userProfileForm.dirty) {
        this.toastService.showError(this.translate.instant('NO_CHANGES_TO_SAVE'));
    }
  }

  formatLocalizedDate(date: string | Date | null | undefined, format: string): string {
    const currentLang = this.translate.currentLang;
    return this.datePipe.transform(date, format, undefined, currentLang) || '';
  }

  openBudgetPeriodModal(): void {
    if (this.customBudgetPeriods.length >= 10) {
      this.toastService.showError(this.translate.instant('CUSTOM_BUDGET_PERIOD_LIMIT_REACHED'));
      return;
    }
    this.modalComponent.open();
  }

  async onPeriodSaved(period: { name: string, startDate: string, endDate: string }): Promise<void> {
    const currentUser = await firstValueFrom(this.authService.currentUser$);
    if (currentUser) {
      try {
        const newPeriodRef = await this.customBudgetPeriodService.addCustomBudgetPeriod(currentUser.uid, period);
        this.userProfileForm.get('budgetPeriod')?.setValue(newPeriodRef.key);
        this.toastService.showSuccess(this.translate.instant('CUSTOM_BUDGET_PERIOD_SAVE_SUCCESS'));
      } catch (error) {
        this.toastService.showError(this.translate.instant('CUSTOM_BUDGET_PERIOD_SAVE_ERROR'));
        console.error('Error saving custom budget period:', error);
      }
    }
  }

  async deleteCustomPeriod(periodId: string | undefined, event: Event): Promise<void> {
    event.stopPropagation();
    if (!periodId) {
      return;
    }

    const currentUser = await firstValueFrom(this.authService.currentUser$);
    if (currentUser) {
        const userProfile = await this.userDataService.getUserProfile(currentUser.uid);
        if (userProfile && userProfile.selectedBudgetPeriodId === periodId) {
            this.toastService.showError(this.translate.instant('DELETE_ACTIVE_BUDGET_PERIOD_ERROR'));
            return;
        }
    }

    this.periodToDeleteId = periodId;
    this.translate.get(['CONFIRM_DELETE_TITLE', 'CONFIRM_DELETE_BUDGET_PERIOD', 'DELETE_BUTTON', 'CANCEL_BUTTON'])
      .subscribe(translations => {
        this.confirmationTitle = translations['CONFIRM_DELETE_TITLE'];
        this.confirmationMessage = translations['CONFIRM_DELETE_BUDGET_PERIOD'];
        this.confirmButtonText = translations['DELETE_BUTTON'];
        this.cancelButtonText = translations['CANCEL_BUTTON'];
        this.confirmationModal.open();
      });
  }

  async onConfirmation(confirmed: boolean): Promise<void> {
    if (confirmed && this.periodToDeleteId) {
      const currentUser = await firstValueFrom(this.authService.currentUser$);
      if (currentUser) {
        try {
          await this.customBudgetPeriodService.deleteCustomBudgetPeriod(currentUser.uid, this.periodToDeleteId);
          if (this.userProfileForm.get('budgetPeriod')?.value === this.periodToDeleteId) {
            this.userProfileForm.get('budgetPeriod')?.setValue(null);
          }
          this.toastService.showSuccess(this.translate.instant('CUSTOM_BUDGET_PERIOD_DELETE_SUCCESS'));
        } catch (error) {
          this.toastService.showError(this.translate.instant('CUSTOM_BUDGET_PERIOD_DELETE_ERROR'));
          console.error('Error deleting custom budget period:', error);
        } finally {
          this.periodToDeleteId = null; // Reset after deletion
        }
      }
    } else {
      // Reset if the user cancels
      this.periodToDeleteId = null;
    }
  }


  toggleCustomBudgetList(): void {
    this.isCustomBudgetListCollapsed = !this.isCustomBudgetListCollapsed;
  }
}
