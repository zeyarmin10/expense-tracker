import { Component, OnDestroy, OnInit, inject, ViewChild, ElementRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Observable, of, map, firstValueFrom, combineLatest, Subscription, BehaviorSubject } from 'rxjs';
import { switchMap, tap, catchError } from 'rxjs/operators';
import { AuthService } from '../../services/auth';
import { getActiveGroupId, UserDataService, UserProfile } from '../../services/user-data';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faSave, faUserCircle, faTrash, faPlus, faChevronDown, faChevronUp, faListUl, faEdit, faTimes, faBell, faBellSlash, faClock, faCamera, faImages } from '@fortawesome/free-solid-svg-icons';
import { icon as faRenderIcon } from '@fortawesome/fontawesome-svg-core';
import { faTrashCan } from '@fortawesome/free-regular-svg-icons';
import { updateProfile } from '@angular/fire/auth';
import { HttpClient } from '@angular/common/http';
import { Camera } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { environment } from '../../../environments/environment';
import { FormsModule } from '@angular/forms';
import { AVAILABLE_CURRENCIES } from '../../core/constants/app.constants';
import { CustomBudgetPeriodModalComponent } from '../common/custom-budget-period-modal/custom-budget-period-modal.component';
import { CustomBudgetPeriod, CustomBudgetPeriodService } from '../../services/custom-budget-period.service';
import { GroupService } from '../../services/group.service';
import { FormatService } from '../../services/format.service';
import { AppTheme, ThemeService } from '../../services/theme.service';
import { NotificationService, NotificationSettingsState } from '../../services/notification.service';
import Swal from 'sweetalert2';
import { CurrentSpaceTitleComponent } from '../common/current-space-title/current-space-title.component';
import { UserAvatarComponent } from '../common/user-avatar/user-avatar.component';

export const AVAILABLE_BUDGET_PERIODS = [
  { code: null, nameKey: 'BUDGET_PERIOD.NONE' },
  { code: 'weekly', nameKey: 'BUDGET_PERIOD.WEEKLY' },
  { code: 'monthly', nameKey: 'BUDGET_PERIOD.MONTHLY' },
  { code: 'yearly', nameKey: 'BUDGET_PERIOD.YEARLY' },
];

const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 3000,
  timerProgressBar: true,
  customClass: { popup: 'colored-toast' },
  didOpen: (toast) => {
    toast.addEventListener('mouseenter', Swal.stopTimer);
    toast.addEventListener('mouseleave', Swal.resumeTimer);
  }
});

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
    CurrentSpaceTitleComponent,
    UserAvatarComponent,
  ],
  providers: [DatePipe],
  templateUrl: './user-profile.html',
  styleUrls: ['./user-profile.css'],
})
export class UserProfileComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private userDataService = inject(UserDataService);
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private translate = inject(TranslateService);
  private datePipe = inject(DatePipe);
  private customBudgetPeriodService = inject(CustomBudgetPeriodService);
  private groupService = inject(GroupService);
  private themeService = inject(ThemeService);
  private notificationService = inject(NotificationService);
  public formatService = inject(FormatService);

  userProfileForm: FormGroup;
  userDisplayData$: Observable<any>;
  userPhotoUrl$: Observable<string | null>;
  private photoUrlOverride = new BehaviorSubject<string | null>(null);
  public userRole: string | null = null;
  public accountType: string | null = null;
  private groupId: string | null = null;

  selectedLanguage: string = 'my';
  selectedCurrency: string = 'MMK';
  selectedBudgetPeriod: string | null = null;
  appTheme: AppTheme = 'system';
  private readonly themeSubscription = new Subscription();
  availableBudgetPeriods = AVAILABLE_BUDGET_PERIODS;
  translatedBudgetPeriods: any[] = [];
  availableCurrencies = AVAILABLE_CURRENCIES;
  translatedCurrencies: any[] = [];
  customBudgetPeriods: CustomBudgetPeriod[] = [];
  showCustomDateRange = false;
  isCustomBudgetListCollapsed = true;
  notificationState: NotificationSettingsState = {
    supported: false,
    permission: 'unsupported',
    enabled: false,
    dailyReminderEnabled: false,
    tokenCount: 0,
  };
  isNotificationBusy = false;
  notificationError = '';
  notificationBusyTarget: 'master' | 'daily' | null = null;

  get isCustomPeriodSelected(): boolean {
    const selectedPeriodId = this.userProfileForm.get('budgetPeriod')?.value;
    if (!selectedPeriodId) {
      return false;
    }
    return this.customBudgetPeriods.some(p => p.id === selectedPeriodId);
  }

  get canEditSettings(): boolean {
    if (this.accountType !== 'group') {
      return true; // Personal account users can always edit
    }
    return this.userRole === 'admin' || this.userRole === 'owner';
  }

  get isNotificationReady(): boolean {
    return (
      this.notificationState.enabled &&
      this.notificationState.permission === 'granted' &&
      this.notificationState.tokenCount > 0
    );
  }

  get isNotificationEnabled(): boolean {
    return this.notificationState.enabled;
  }

  get canEnableNotifications(): boolean {
    return (
      !this.isNotificationBusy &&
      this.notificationState.supported &&
      !this.notificationState.enabled
    );
  }

  get canDisableNotifications(): boolean {
    return !this.isNotificationBusy && this.notificationState.enabled;
  }

  get canToggleDailyReminder(): boolean {
    return !this.isNotificationBusy && this.notificationState.enabled;
  }

  get canChangeNotificationEnabled(): boolean {
    return this.notificationState.enabled
      ? this.canDisableNotifications
      : this.canEnableNotifications;
  }

  @ViewChild(CustomBudgetPeriodModalComponent) private modalComponent!: CustomBudgetPeriodModalComponent;
  @ViewChild('avatarFileInput') avatarFileInput!: ElementRef<HTMLInputElement>;

  faPlus = faPlus;
  faSave = faSave;
  faUserCircle = faUserCircle;
  faEdit = faEdit;
  faTimes = faTimes;
  faTrash = faTrash;
  faChevronDown = faChevronDown;
  faChevronUp = faChevronUp;
  imageLoadError: boolean = false;
  isEditingName: boolean = false;
  isFormReady: boolean = false;
  isDeletingAccount: boolean = false;
  faListUl = faListUl;
  faTrashCan = faTrashCan;
  faBell = faBell;
  faBellSlash = faBellSlash;
  faClock = faClock;
  faCamera = faCamera;
  isUploadingAvatar = false;

  constructor() {
    this.userProfileForm = this.fb.group({
      displayName: ['', [Validators.required, Validators.maxLength(50)]],
      currency: ['MMK', Validators.required],
      budgetPeriod: [null],
      budgetStartDate: [{ value: null, disabled: true }],
      budgetEndDate: [{ value: null, disabled: true }],
    });

    const getRole = (profile: UserProfile | null | undefined): string => {
      if (!profile) {
        return 'N/A';
      }

      if (profile.currentSpaceRole) {
        return profile.currentSpaceRole;
      }

      const activeGroupId = getActiveGroupId(profile);
      if (activeGroupId) {
        return profile.spaceMemberships?.[activeGroupId] || profile.roles?.[activeGroupId] || 'member';
      }

      return 'owner';
    };

    this.userDisplayData$ = this.authService.currentUser$.pipe(
      switchMap((user) => {
        if (user && user.uid) {
          return this.userDataService.getUserProfile(user.uid).pipe(
            switchMap(profile => {
              if (!profile) return of(null);

              this.accountType = profile.accountType || 'personal';
              this.userRole = getRole(profile);
              this.groupId = getActiveGroupId(profile);

              this.syncSettingsControlState();

              // Patch form values
              this.userProfileForm.patchValue({
                displayName: profile.displayName || user.displayName || '',
                currency: profile.currency || 'MMK',
                budgetPeriod: profile.selectedBudgetPeriodId || profile.budgetPeriod || null,
                budgetStartDate: profile.budgetStartDate || null,
                budgetEndDate: profile.budgetEndDate || null,
              }, { emitEvent: false });
              this.selectedCurrency = profile.currency || 'MMK';
              this.handleBudgetPeriodChange(this.userProfileForm.get('budgetPeriod')?.value, true);

              // Fetch group name if accountType is 'group'
              const activeGroupId = getActiveGroupId(profile);
              const groupName$ = (profile.currentSpaceType === 'group' || profile.accountType === 'group') && activeGroupId
                ? this.groupService.getGroupName(activeGroupId)
                : of(null);

              return combineLatest([groupName$, this.authService.userProfile$]).pipe(
                map(([groupName, mergedProfile]) => {
                  const effectiveRole = getRole(mergedProfile || profile);
                  this.userRole = effectiveRole;
                  this.accountType = mergedProfile?.accountType || this.accountType;
                  this.groupId = getActiveGroupId(mergedProfile || profile);
                  this.syncSettingsControlState();
                  // group member ဆို mergedProfile မှာ group currency ရှိပြီးသား
                  const effectiveCurrency = mergedProfile?.currency || profile.currency || 'MMK';

                  // form ကိုလည်း group currency နဲ့ update လုပ်ပါ
                  this.userProfileForm.patchValue({
                    currency: effectiveCurrency
                  }, { emitEvent: false });

                  return ({
                    email: profile.email || user.email || 'N/A',
                    createdAt: profile.createdAt || (user.metadata as any).creationTime || new Date().toISOString(),
                    currency: effectiveCurrency,   // ← group currency သုံးတယ်
                    budgetPeriod: mergedProfile?.budgetPeriod || profile.budgetPeriod || null,
                    budgetStartDate: mergedProfile?.budgetStartDate || profile.budgetStartDate || null,
                    budgetEndDate: mergedProfile?.budgetEndDate || profile.budgetEndDate || null,
                    roles: effectiveRole,
                    accountType: mergedProfile?.accountType || this.accountType,
                    groupName: groupName
                  });
                })
              );
            }),
            catchError((err) => {
              console.error('Error fetching user profile data:', err);
              Swal.fire({ icon: 'error', title: this.translate.instant('ERROR_TITLE'), text: this.translate.instant('PROFILE_FETCH_ERROR') });
              return of(null);
            })
          );
        }
        return of(null);
      })
    );

    this.userPhotoUrl$ = combineLatest([
      this.authService.userProfile$.pipe(map((profile) => profile?.photoURL || null)),
      this.photoUrlOverride,
    ]).pipe(
      map(([dbUrl, overrideUrl]) => {
        this.imageLoadError = false;
        if (overrideUrl === '') return null;
        return overrideUrl ?? dbUrl;
      })
    );

    // ✅ isFormReady flag — initial patch ပြီးမှသာ autoSave trigger ဖြစ်မည်
    setTimeout(() => { this.isFormReady = true; }, 500);

    this.userProfileForm.get('budgetPeriod')?.valueChanges.subscribe((periodId) => {
      this.handleBudgetPeriodChange(periodId);
      if (this.isFormReady && periodId && periodId !== 'custom') {
        this.autoSaveField('budgetPeriod');
      }
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

    this.themeSubscription.add(
      this.themeService.theme$.subscribe((theme) => {
        this.appTheme = theme;
      })
    );

    this.translate.onLangChange.subscribe(() => {
      this.translateCurrencyNames();
      this.translateBudgetPeriodNames();
    });

    this.translateCurrencyNames();
    this.translateBudgetPeriodNames();
    void this.refreshNotificationState();

    this.authService.currentUser$.pipe(
      switchMap(user => user ? this.customBudgetPeriodService.getCustomBudgetPeriods(user.uid) : of([]))
    ).subscribe(periods => {
      this.customBudgetPeriods = periods.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
      this.handleBudgetPeriodChange(this.userProfileForm.get('budgetPeriod')?.value, true);
    });
  }

  ngOnDestroy(): void {
    this.themeSubscription.unsubscribe();
  }

  translateCurrencyNames() {
    const currentCurrency = this.userProfileForm.get('currency')?.value;
    this.translatedCurrencies = this.availableCurrencies.map((currency) => ({
      ...currency,
      name: this.translate.instant('CURRENCY_NAMES.' + currency.code),
    }));
    if (currentCurrency) {
      setTimeout(() => {
        this.userProfileForm.get('currency')?.setValue(currentCurrency, { emitEvent: false });
      }, 0);
    }
  }

  translateBudgetPeriodNames() {
    this.translatedBudgetPeriods = this.availableBudgetPeriods.map((period) => ({
      ...period,
      name: this.translate.instant(period.nameKey),
    }));
  }

  private syncSettingsControlState(): void {
    const currencyControl = this.userProfileForm.get('currency');
    const budgetPeriodControl = this.userProfileForm.get('budgetPeriod');
    const startDateControl = this.userProfileForm.get('budgetStartDate');
    const endDateControl = this.userProfileForm.get('budgetEndDate');

    if (this.canEditSettings) {
      currencyControl?.enable({ emitEvent: false });
      budgetPeriodControl?.enable({ emitEvent: false });
    } else {
      currencyControl?.disable({ emitEvent: false });
      budgetPeriodControl?.disable({ emitEvent: false });
      startDateControl?.disable({ emitEvent: false });
      endDateControl?.disable({ emitEvent: false });
      return;
    }

    if (this.showCustomDateRange) {
      startDateControl?.enable({ emitEvent: false });
      endDateControl?.enable({ emitEvent: false });
    } else {
      startDateControl?.disable({ emitEvent: false });
      endDateControl?.disable({ emitEvent: false });
    }
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

    this.syncSettingsControlState();
  }

  // ✅ Auto-save: budget period / currency ပြောင်းလဲတာနဲ့ ချက်ချင်း သိမ်းမယ်
  async autoSaveField(field: 'budgetPeriod' | 'currency'): Promise<void> {
    if (!this.canEditSettings) return;

    const currentUser = await firstValueFrom(this.authService.currentUser$);
    if (!currentUser) return;

    const formValues = this.userProfileForm.getRawValue();
    const isCustom = this.customBudgetPeriods.some(p => p.id === formValues.budgetPeriod);

    const profileData: Partial<UserProfile> = {
      currency: formValues.currency,
      budgetPeriod: isCustom ? 'custom' : formValues.budgetPeriod,
      budgetStartDate: isCustom ? formValues.budgetStartDate : null,
      budgetEndDate: isCustom ? formValues.budgetEndDate : null,
      selectedBudgetPeriodId: isCustom ? formValues.budgetPeriod : null
    };

    try {
      await this.userDataService.updateUserProfile(currentUser.uid, profileData);

      if (this.canEditSettings && this.accountType === 'group' && this.groupId) {
        await this.groupService.updateGroupSettings(this.groupId, {
          currency: profileData.currency,
          budgetPeriod: profileData.budgetPeriod,
          budgetStartDate: profileData.budgetStartDate,
          budgetEndDate: profileData.budgetEndDate,
          selectedBudgetPeriodId: profileData.selectedBudgetPeriodId,
        });
      }
      this.userProfileForm.markAsPristine();
      Toast.fire({ icon: 'success', title: this.translate.instant('PROFILE_UPDATE_SUCCESS') });
    } catch (error: any) {
      console.error('Auto-save error:', error);
    }
  }

  // ✅ Display name: edit mode toggle
  startEditName(): void {
    this.isEditingName = true;
    setTimeout(() => {
      const input = document.getElementById('displayName') as HTMLInputElement;
      if (input) { input.focus(); input.select(); }
    }, 50);
  }

  cancelEditName(): void {
    this.isEditingName = false;
    // revert to original value
    this.authService.currentUser$.pipe(
      switchMap(user => user ? this.userDataService.getUserProfile(user.uid) : of(null)),
    ).subscribe(profile => {
      if (profile) {
        this.userProfileForm.patchValue({ displayName: profile.displayName || '' }, { emitEvent: false });
        this.userProfileForm.get('displayName')?.markAsPristine();
      }
    });
  }

  async saveDisplayName(): Promise<void> {
    const currentUser = await firstValueFrom(this.authService.currentUser$);
    if (!currentUser) return;
    const displayName = this.userProfileForm.get('displayName')?.value || '';
    try {
      await updateProfile(currentUser, { displayName });
      await this.userDataService.updateUserProfile(currentUser.uid, { displayName });
      this.userProfileForm.get('displayName')?.markAsPristine();
      this.isEditingName = false;
      Toast.fire({ icon: 'success', title: this.translate.instant('PROFILE_UPDATE_SUCCESS') });
    } catch (error: any) {
      console.error('Name save error:', error);
    }
  }

  onThemeChange(theme: AppTheme): void {
    this.themeService.setTheme(theme);
  }

  onLanguageChange(language: string): void {
    this.selectedLanguage = language;
    this.translate.use(this.selectedLanguage);
    localStorage.setItem('selectedLanguage', this.selectedLanguage);
  }

  async refreshNotificationState(): Promise<void> {
    try {
      this.notificationState = await this.notificationService.getState();
      this.notificationError = '';
    } catch (error: any) {
      console.error('Notification state error:', error);
      await this.showNotificationError(this.translate.instant('NOTI_STATE_ERROR'));
    }
  }

  async enablePushNotifications(previousState = this.notificationState): Promise<void> {
    this.isNotificationBusy = true;
    this.notificationBusyTarget = 'master';
    this.notificationError = '';

    try {
      this.notificationState = await this.notificationService.enableNotifications();
      Toast.fire({ icon: 'success', title: this.translate.instant('NOTI_ENABLE_SUCCESS') });
    } catch (error: any) {
      console.error('Notification enable error:', error);
      this.notificationState = { ...previousState };
      await this.showNotificationError(this.translateNotificationError(error, 'NOTI_ENABLE_ERROR'));
    } finally {
      this.isNotificationBusy = false;
      this.notificationBusyTarget = null;
    }
  }

  async disablePushNotifications(previousState = this.notificationState): Promise<void> {
    this.isNotificationBusy = true;
    this.notificationBusyTarget = 'master';
    this.notificationError = '';

    try {
      this.notificationState = await this.notificationService.disableNotifications();
      Toast.fire({ icon: 'success', title: this.translate.instant('NOTI_DISABLE_SUCCESS') });
    } catch (error: any) {
      console.error('Notification disable error:', error);
      this.notificationState = { ...previousState };
      await this.showNotificationError(this.translateNotificationError(error, 'NOTI_DISABLE_ERROR'));
    } finally {
      this.isNotificationBusy = false;
      this.notificationBusyTarget = null;
    }
  }

  async onNotificationToggleChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const previousState = { ...this.notificationState };
    const enabled = input.checked;

    input.checked = previousState.enabled;

    if (!this.canChangeNotificationEnabled) {
      return;
    }

    await this.togglePushNotifications(enabled, previousState);
    input.checked = this.notificationState.enabled;
  }

  async togglePushNotifications(
    enabled: boolean,
    previousState = this.notificationState,
  ): Promise<void> {
    if (enabled) {
      await this.enablePushNotifications(previousState);
      return;
    }

    await this.disablePushNotifications(previousState);
  }

  async onDailyReminderToggleChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const previousState = { ...this.notificationState };
    const enabled = input.checked;

    input.checked = previousState.dailyReminderEnabled;

    if (!this.canToggleDailyReminder) {
      return;
    }

    await this.setDailyReminder(enabled, previousState);
    input.checked = this.notificationState.dailyReminderEnabled;
  }

  async setDailyReminder(
    enabled: boolean,
    previousState = this.notificationState,
  ): Promise<void> {
    this.isNotificationBusy = true;
    this.notificationBusyTarget = 'daily';
    this.notificationError = '';

    try {
      this.notificationState = await this.notificationService.setDailyReminderEnabled(enabled);
      Toast.fire({ icon: 'success', title: this.translate.instant('NOTI_SETTINGS_SAVED') });
    } catch (error: any) {
      console.error('Daily reminder setting error:', error);
      this.notificationState = { ...previousState };
      await this.showNotificationError(this.translateNotificationError(error, 'NOTI_SETTINGS_ERROR'));
    } finally {
      this.isNotificationBusy = false;
      this.notificationBusyTarget = null;
    }
  }

  getNotificationPermissionLabel(): string {
    if (this.notificationState.enabled) {
      return this.translate.instant('NOTI_STATUS_ENABLED');
    }
    if (!this.notificationState.supported) {
      return this.translate.instant('NOTI_PERMISSION_UNSUPPORTED');
    }

    const permission = this.notificationState.permission;
    if (permission === 'denied') {
      return this.translate.instant('NOTI_PERMISSION_DENIED');
    }
    if (permission === 'unsupported') {
      return this.translate.instant('NOTI_PERMISSION_UNSUPPORTED');
    }
    return this.translate.instant('NOTI_STATUS_DISABLED');
  }

  private translateNotificationError(error: any, fallbackKey: string): string {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    if (message.startsWith('NOTIFICATION_')) {
      return this.translate.instant(message);
    }
    if (/invalid-vapid-key/i.test(code) || /invalid-vapid-key/i.test(message)) {
      return this.translate.instant('NOTIFICATION_VAPID_KEY_INVALID');
    }
    if (/permission[_ -]?denied/i.test(message)) {
      return this.translate.instant('NOTIFICATION_SETTINGS_PERMISSION_DENIED');
    }
    if (/push service/i.test(message)) {
      return this.translate.instant('NOTIFICATION_PUSH_SERVICE_UNAVAILABLE');
    }
    if (/token/i.test(code) || /token/i.test(message)) {
      return this.translate.instant('NOTIFICATION_TOKEN_FAILED');
    }
    return this.translate.instant(fallbackKey);
  }

  private async showNotificationError(message: string): Promise<void> {
    this.notificationError = message;
    await Swal.fire({
      icon: 'error',
      title: this.translate.instant('ERROR_TITLE'),
      text: message,
    });
  }

  onImageError(): void {
    this.imageLoadError = true;
  }

  async pickAvatar(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      this.avatarFileInput.nativeElement.value = '';
      this.avatarFileInput.nativeElement.click();
      return;
    }

    const currentPhotoUrl = await firstValueFrom(this.userPhotoUrl$);
    const hasPhoto = !!currentPhotoUrl;

    const camSvg    = faRenderIcon(faCamera).html.join('');
    const galSvg    = faRenderIcon(faImages).html.join('');
    const trashSvg  = faRenderIcon(faTrash).html.join('');
    const camLabel    = this.translate.instant('VOUCHER_CAMERA');
    const galLabel    = this.translate.instant('VOUCHER_GALLERY');
    const removeLabel = this.translate.instant('AVATAR_REMOVE_LABEL');
    const cancelLabel = this.translate.instant('CANCEL_BUTTON') || 'Cancel';

    let photoChoice: 'camera' | 'gallery' | 'remove' | null = null;

    await Swal.fire({
      title: this.translate.instant('AVATAR_PICK_TITLE'),
      html: `
        <div class="swal-avatar-pick-row">
          <button type="button" id="swal-cam-btn" class="swal-avatar-pick-btn swal-avatar-pick-camera">
            <span class="swal-avatar-pick-icon">${camSvg}</span>
            <span class="swal-avatar-pick-label">${camLabel}</span>
          </button>
          <button type="button" id="swal-gal-btn" class="swal-avatar-pick-btn swal-avatar-pick-gallery">
            <span class="swal-avatar-pick-icon">${galSvg}</span>
            <span class="swal-avatar-pick-label">${galLabel}</span>
          </button>
        </div>
        ${hasPhoto ? `<button type="button" id="swal-remove-btn" class="swal-avatar-pick-remove"><span class="swal-avatar-remove-icon">${trashSvg}</span>${removeLabel}</button>` : ''}
        <button type="button" id="swal-cancel-btn" class="swal-avatar-pick-cancel">${cancelLabel}</button>
      `,
      showConfirmButton: false,
      showCancelButton: false,
      allowOutsideClick: true,
      customClass: { popup: 'swal-avatar-pick-popup' },
      didOpen: () => {
        document.getElementById('swal-cam-btn')?.addEventListener('click', () => {
          photoChoice = 'camera';
          Swal.close();
        });
        document.getElementById('swal-gal-btn')?.addEventListener('click', () => {
          photoChoice = 'gallery';
          Swal.close();
        });
        document.getElementById('swal-remove-btn')?.addEventListener('click', () => {
          photoChoice = 'remove';
          Swal.close();
        });
        document.getElementById('swal-cancel-btn')?.addEventListener('click', () => Swal.close());
      },
    });

    if (photoChoice === 'camera') {
      try {
        const perms = await Camera.requestPermissions({ permissions: ['camera'] });
        if (perms.camera === 'denied') {
          Toast.fire({ icon: 'error', title: this.translate.instant('PERMISSION_CAMERA_DENIED') });
          return;
        }
        const photo = await Camera.takePhoto({ quality: 85 });
        if (photo.webPath) {
          const response = await fetch(photo.webPath);
          const blob = await response.blob();
          const file = new File([blob], `avatar_${Date.now()}.jpg`, { type: 'image/jpeg' });
          await this.uploadAvatar(file);
        }
      } catch (e: any) {
        if (!e?.message?.toLowerCase().includes('cancel')) {
          Toast.fire({ icon: 'error', title: this.translate.instant('AVATAR_UPLOAD_ERROR') });
        }
      }
    } else if (photoChoice === 'gallery') {
      this.avatarFileInput.nativeElement.value = '';
      this.avatarFileInput.nativeElement.click();
    } else if (photoChoice === 'remove') {
      await this.removeAvatar();
    }
  }

  async removeAvatar(): Promise<void> {
    const currentUser = await firstValueFrom(this.authService.currentUser$);
    if (!currentUser) return;

    this.isUploadingAvatar = true;
    try {
      await updateProfile(currentUser, { photoURL: null });
      await this.userDataService.updateUserProfile(currentUser.uid, { photoURL: null });
      this.photoUrlOverride.next('');
      Toast.fire({ icon: 'success', title: this.translate.instant('AVATAR_REMOVE_SUCCESS') });
    } catch (e) {
      console.error('Avatar remove error:', e);
      Toast.fire({ icon: 'error', title: this.translate.instant('AVATAR_UPLOAD_ERROR') });
    } finally {
      this.isUploadingAvatar = false;
    }
  }

  async onAvatarFileSelected(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    await this.uploadAvatar(file);
    (event.target as HTMLInputElement).value = '';
  }

  async uploadAvatar(file: File): Promise<void> {
    const currentUser = await firstValueFrom(this.authService.currentUser$);
    if (!currentUser) return;

    const profile = await firstValueFrom(this.userDataService.getUserProfile(currentUser.uid));
    const lastUpload = profile?.lastAvatarUploadAt ?? null;
    if (lastUpload && Date.now() - lastUpload < 24 * 60 * 60 * 1000) {
      const remainingMs = 24 * 60 * 60 * 1000 - (Date.now() - lastUpload);
      const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
      Toast.fire({ icon: 'warning', title: this.translate.instant('AVATAR_RATE_LIMIT_ERROR', { hours: remainingHours }) });
      return;
    }

    this.isUploadingAvatar = true;
    try {
      const compressed = await this.compressAvatarImage(file);
      const { cloudName, uploadPreset } = environment.cloudinary;
      const formData = new FormData();
      formData.append('file', compressed);
      formData.append('upload_preset', uploadPreset);
      formData.append('folder', `profiles/${currentUser.uid}`);

      const resp = await firstValueFrom(
        this.http.post<{ secure_url: string }>(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, formData)
      );

      await updateProfile(currentUser, { photoURL: resp.secure_url });
      await this.userDataService.updateUserProfile(currentUser.uid, {
        photoURL: resp.secure_url,
        lastAvatarUploadAt: Date.now(),
      });

      this.photoUrlOverride.next(resp.secure_url);
      Toast.fire({ icon: 'success', title: this.translate.instant('AVATAR_UPLOAD_SUCCESS') });
    } catch (e: any) {
      console.error('Avatar upload error:', e);
      Toast.fire({ icon: 'error', title: this.translate.instant('AVATAR_UPLOAD_ERROR') });
    } finally {
      this.isUploadingAvatar = false;
    }
  }

  private compressAvatarImage(file: File): Promise<File> {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const maxSize = 400;
        const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => resolve(new File([blob!], file.name, { type: 'image/jpeg' })),
          'image/jpeg', 0.85
        );
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
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
          // Step 1: Update the user's personal profile
          if (currentUser.displayName !== profileData.displayName) {
            await updateProfile(currentUser, { displayName: profileData.displayName });
          }
          await this.userDataService.updateUserProfile(currentUser.uid, profileData);

          // Step 2: If the user is an admin/owner of a group, update the group's settings
          if (this.canEditSettings && this.accountType === 'group' && this.groupId) {
            const groupSettings = {
              currency: profileData.currency,
              budgetPeriod: profileData.budgetPeriod,
              budgetStartDate: profileData.budgetStartDate,
              budgetEndDate: profileData.budgetEndDate,
              selectedBudgetPeriodId: profileData.selectedBudgetPeriodId,
            };
            await this.groupService.updateGroupSettings(this.groupId, groupSettings);
          }

          Toast.fire({ icon: 'success', title: this.translate.instant('PROFILE_UPDATE_SUCCESS') });
          this.userProfileForm.markAsPristine();

        } catch (error: any) {
          console.error('Error updating profile:', error);
          Swal.fire({ icon: 'error', title: this.translate.instant('ERROR_TITLE'), text: error.message || this.translate.instant('PROFILE_UPDATE_ERROR') });
        }
      } else {
        Swal.fire({ icon: 'error', title: this.translate.instant('ERROR_TITLE'), text: this.translate.instant('AUTH_ERROR_PROFILE_UPDATE') });
      }
    } else if (this.userProfileForm.invalid) {
      Swal.fire({ icon: 'error', title: this.translate.instant('ERROR_TITLE'), text: this.translate.instant('INVALID_FORM_PROFILE') });
    }
  }

  openBudgetPeriodModal(): void {
    if (!this.canEditSettings) {
      return;
    }
    if (this.customBudgetPeriods.length >= 10) {
      Swal.fire({ icon: 'error', title: this.translate.instant('ERROR_TITLE'), text: this.translate.instant('CUSTOM_BUDGET_PERIOD_LIMIT_REACHED') });
      return;
    }
    this.modalComponent.open();
  }

  async onPeriodSaved(period: { name: string, startDate: string, endDate: string }): Promise<void> {
    if (!this.canEditSettings) {
      return;
    }
    const currentUser = await firstValueFrom(this.authService.currentUser$);
    if (currentUser) {
      try {
        const newPeriodRef = await this.customBudgetPeriodService.addCustomBudgetPeriod(currentUser.uid, period);
        this.userProfileForm.get('budgetPeriod')?.setValue(newPeriodRef.key);
        Toast.fire({ icon: 'success', title: this.translate.instant('CUSTOM_BUDGET_PERIOD_SAVE_SUCCESS') });
      } catch (error) {
        Swal.fire({ icon: 'error', title: this.translate.instant('ERROR_TITLE'), text: this.translate.instant('CUSTOM_BUDGET_PERIOD_SAVE_ERROR') });
        console.error('Error saving custom budget period:', error);
      }
    }
  }

  async deleteCustomPeriod(periodId: string | undefined, event: Event): Promise<void> {
    event.stopPropagation();
    if (!this.canEditSettings) return;
    if (!periodId) return;

    const currentUser = await firstValueFrom(this.authService.currentUser$);
    if (currentUser) {
      const userProfile = await firstValueFrom(this.userDataService.getUserProfile(currentUser.uid));
      if (userProfile && userProfile.selectedBudgetPeriodId === periodId) {
        Swal.fire({ icon: 'error', title: this.translate.instant('ERROR_TITLE'), text: this.translate.instant('DELETE_ACTIVE_BUDGET_PERIOD_ERROR') });
        return;
      }
    }

    const translations = await firstValueFrom(this.translate.get(['CONFIRM_DELETE_TITLE', 'CONFIRM_DELETE_BUDGET_PERIOD', 'DELETE_BUTTON', 'CANCEL_BUTTON']));

    Swal.fire({
      title: translations['CONFIRM_DELETE_TITLE'],
      text: translations['CONFIRM_DELETE_BUDGET_PERIOD'],
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: translations['DELETE_BUTTON'],
      cancelButtonText: translations['CANCEL_BUTTON'],
      reverseButtons: true
    }).then(async (result) => {
      if (result.isConfirmed) {
        if (currentUser) {
          try {
            await this.customBudgetPeriodService.deleteCustomBudgetPeriod(currentUser.uid, periodId);
            if (this.userProfileForm.get('budgetPeriod')?.value === periodId) {
              this.userProfileForm.get('budgetPeriod')?.setValue(null);
            }
            Toast.fire({ icon: 'success', title: this.translate.instant('CUSTOM_BUDGET_PERIOD_DELETE_SUCCESS') });
          } catch (error) {
            Swal.fire({ icon: 'error', title: this.translate.instant('ERROR_TITLE'), text: this.translate.instant('CUSTOM_BUDGET_PERIOD_DELETE_ERROR') });
            console.error('Error deleting custom budget period:', error);
          }
        }
      }
    });
  }

  toggleCustomBudgetList(): void {
    this.isCustomBudgetListCollapsed = !this.isCustomBudgetListCollapsed;
  }

  async deleteAccount(): Promise<void> {
    const currentUser = await firstValueFrom(this.authService.currentUser$);
    if (!currentUser) return;

    const providerId = currentUser.providerData[0]?.providerId;

    // Step 1: Require typing DELETE to confirm
    const confirmResult = await Swal.fire({
      title: this.translate.instant('DELETE_ACCOUNT_CONFIRM_TITLE'),
      html: `<p style="font-size:0.9rem;color:var(--text-sub)">${this.translate.instant('DELETE_ACCOUNT_CONFIRM_TEXT')}</p>
             <p style="font-size:0.8rem;margin-top:0.75rem;opacity:0.65">${this.translate.instant('DELETE_ACCOUNT_TYPE_TO_CONFIRM')}</p>`,
      input: 'text',
      inputPlaceholder: 'DELETE',
      inputAttributes: { autocomplete: 'off', style: 'text-align:center' },
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: this.translate.instant('DELETE_ACCOUNT_BUTTON'),
      cancelButtonText: this.translate.instant('CANCEL_BUTTON'),
      confirmButtonColor: '#f87171',
      preConfirm: (value: string) => {
        if (value !== 'DELETE') {
          Swal.showValidationMessage(this.translate.instant('DELETE_ACCOUNT_TYPE_MISMATCH'));
          return false;
        }
        return true;
      },
    });

    if (!confirmResult.isConfirmed) return;

    // Step 2: If email/password user, ask for password
    let password: string | undefined;
    if (providerId === 'password') {
      const passResult = await Swal.fire({
        title: this.translate.instant('DELETE_ACCOUNT_PASSWORD_TITLE'),
        input: 'password',
        inputPlaceholder: this.translate.instant('DELETE_ACCOUNT_PASSWORD_PLACEHOLDER'),
        showCancelButton: true,
        confirmButtonText: this.translate.instant('DELETE_ACCOUNT_BUTTON'),
        cancelButtonText: this.translate.instant('CANCEL_BUTTON'),
        confirmButtonColor: '#f87171',
        preConfirm: (value: string) => {
          if (!value) {
            Swal.showValidationMessage(this.translate.instant('ERROR_PASSWORD_REQUIRED'));
            return false;
          }
          return value;
        },
      });
      if (!passResult.isConfirmed) return;
      password = passResult.value;
    }

    // Step 3: Execute deletion
    this.isDeletingAccount = true;
    try {
      await this.authService.deleteAccount(password);
    } catch (error: any) {
      this.isDeletingAccount = false;
      const msg: string = error?.message || '';
      if (msg.startsWith('HAS_MEMBERS:')) {
        const groupName = msg.replace('HAS_MEMBERS:', '');
        Swal.fire({
          icon: 'error',
          title: this.translate.instant('ERROR_TITLE'),
          text: this.translate.instant('DELETE_ACCOUNT_HAS_MEMBERS_ERROR', { groupName }),
        });
      } else {
        Swal.fire({
          icon: 'error',
          title: this.translate.instant('ERROR_TITLE'),
          text: this.translate.instant('DELETE_ACCOUNT_ERROR'),
        });
      }
    }
  }
}
