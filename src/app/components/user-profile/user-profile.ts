import { Component, OnInit, inject, ViewChild } from '@angular/core';
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
import { UserDataService, UserProfile } from '../../services/user-data';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faSave, faUserCircle, faTrash, faPlus, faChevronDown, faChevronUp, faListUl } from '@fortawesome/free-solid-svg-icons';
import { updateProfile } from '@angular/fire/auth';
import { FormsModule } from '@angular/forms';
import { AVAILABLE_CURRENCIES } from '../../core/constants/app.constants';
import { CustomBudgetPeriodModalComponent } from '../common/custom-budget-period-modal/custom-budget-period-modal.component';
import { CustomBudgetPeriod, CustomBudgetPeriodService } from '../../services/custom-budget-period.service';
import { ConfirmationModal } from '../common/confirmation-modal/confirmation-modal';
import { ToastService } from '../../services/toast';
import { GroupService } from '../../services/group.service';

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
  private groupService = inject(GroupService);

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

    const getRole = (roles: { [key: string]: string } | null | undefined): string => {
      if (!roles || typeof roles !== 'object' || Object.keys(roles).length === 0) {
        return 'N/A'; 
      }
      return Object.values(roles)[0];
    };

    this.userDisplayData$ = this.authService.currentUser$.pipe(
      switchMap((user) => {
        if (user && user.uid) {
          return this.userDataService.getUserProfile(user.uid).pipe(
            switchMap(profile => {
              if (!profile) return of(null);

              // Patch form values
              this.userProfileForm.patchValue({
                displayName: profile.displayName || user.displayName || '',
                currency: profile.currency || 'MMK',
                budgetPeriod: profile.selectedBudgetPeriodId || profile.budgetPeriod || null,
                budgetStartDate: profile.budgetStartDate || null,
                budgetEndDate: profile.budgetEndDate || null,
              });
              this.selectedCurrency = profile.currency || 'MMK';
              this.handleBudgetPeriodChange(this.userProfileForm.get('budgetPeriod')?.value, true);

              // Fetch group name if accountType is 'group'
              const groupName$ = profile.accountType === 'group' && profile.groupId
                ? this.groupService.getGroupName(profile.groupId)
                : of(null);

              return groupName$.pipe(
                map(groupName => ({
                  email: profile.email || user.email || 'N/A',
                  createdAt: profile.createdAt || (user.metadata as any).creationTime || new Date().toISOString(),
                  currency: profile.currency || 'MMK',
                  budgetPeriod: profile.budgetPeriod || null,
                  budgetStartDate: profile.budgetStartDate || null,
                  budgetEndDate: profile.budgetEndDate || null,
                  roles: getRole(profile.roles),
                  accountType: profile.accountType || 'personal',
                  groupName: groupName
                }))
              );
            }),
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
      const browserLang = this.translate.getBrowserLang();
      this.selectedLanguage = browserLang && ['en', 'my'].includes(browserLang) ? browserLang : 'my';
      this.translate.use(this.selectedLanguage);
    }

    this.translate.onLangChange.subscribe(() => {
      this.translateCurrencyNames();
      this.translateBudgetPeriodNames();
    });

    this.translateCurrencyNames();
    this.translateBudgetPeriodNames();

    this.authService.currentUser$.pipe(
      switchMap(user => user ? this.customBudgetPeriodService.getCustomBudgetPeriods(user.uid) : of([]))
    ).subscribe(periods => {
      this.customBudgetPeriods = periods.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
      this.handleBudgetPeriodChange(this.userProfileForm.get('budgetPeriod')?.value, true);
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

    const customPeriod = this.customBudgetPeriods.find(p => p.id === periodId);

    if (customPeriod) {
      this.showCustomDateRange = true;
      startDateControl?.setValue(customPeriod.startDate, { emitEvent: false });
      endDateControl?.setValue(customPeriod.endDate, { emitEvent: false });
    } else {
      this.showCustomDateRange = periodId === 'custom'; 
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
    if (!periodId) return;

    const currentUser = await firstValueFrom(this.authService.currentUser$);
    if (currentUser) {
      const userProfile = await firstValueFrom(this.userDataService.getUserProfile(currentUser.uid));
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
          this.periodToDeleteId = null;
        }
      }
    } else {
      this.periodToDeleteId = null;
    }
  }

  toggleCustomBudgetList(): void {
    this.isCustomBudgetListCollapsed = !this.isCustomBudgetListCollapsed;
  }
}
