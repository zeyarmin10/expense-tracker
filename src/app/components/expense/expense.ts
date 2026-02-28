import {
  Component,
  OnInit,
  inject,
  ViewChild
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
  FormsModule,
} from '@angular/forms';
import { ServiceIExpense as IExpense, ExpenseService } from '../../services/expense';
import { ServiceICategory, CategoryService } from '../../services/category';
import {
  Observable,
  BehaviorSubject,
  combineLatest,
  map,
} from 'rxjs';
import { TranslateService, TranslateModule } from '@ngx-translate/core';
import Swal from 'sweetalert2';

import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import {
  faPlus,
  faEdit,
  faTrash,
  faSave,
  faTimes,
  faSync,
  faInfoCircle,
} from '@fortawesome/free-solid-svg-icons';

import { CategoryModalComponent } from '../common/category-modal/category-modal';
import { ConfirmationModal } from '../common/confirmation-modal/confirmation-modal';
import { ToastService } from '../../services/toast';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth';
import { UserProfile } from '../../services/user-data';
import {
  BURMESE_MONTH_ABBREVIATIONS,
} from '../../core/constants/app.constants';

import { FormatService } from '../../services/format.service';

@Component({
  selector: 'app-expense',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    FontAwesomeModule,
    CategoryModalComponent,
    TranslateModule,
    ConfirmationModal,
  ],
  providers: [DatePipe],
  templateUrl: './expense.html',
  styleUrls: ['./expense.css'],
})
export class Expense implements OnInit {
  @ViewChild(CategoryModalComponent) categoryModal!: CategoryModalComponent;
  @ViewChild('deleteConfirmationModal')
  deleteConfirmationModal!: ConfirmationModal;
  @ViewChild('errorModal') errorModal!: ConfirmationModal;
  @ViewChild('infoModal') infoModal!: ConfirmationModal;

  newExpenseForm: FormGroup;
  editingForm: FormGroup | null = null;

  expenses$: Observable<IExpense[]>;
  categories$: Observable<ServiceICategory[]>;

  public _selectedDate$ = new BehaviorSubject<string>('');
  private _activeCurrencyFilter$ = new BehaviorSubject<string | null>(null);
  private _activeCategoryFilter$ = new BehaviorSubject<string | null>(null);

  private authService = inject(AuthService);
  public formatService = inject(FormatService);

  displayedExpenses$: Observable<IExpense[]>;
  totalExpensesByCurrency$: Observable<{ [key: string]: number }>;

  expenseService = inject(ExpenseService);
  categoryService = inject(CategoryService);
  datePipe = inject(DatePipe);
  translate = inject(TranslateService);
  toastService = inject(ToastService);

  editingExpenseId: string | null = null;
  public userRole: string | null = null;
  isSaving = false;
  isNewExpenseFormVisible = true;
  objectKeys = Object.keys;

  faPlus = faPlus;
  faEdit = faEdit;
  faTrash = faTrash;
  faSave = faSave;
  faTimes = faTimes;
  faSync = faSync;
  faInfoCircle = faInfoCircle;

  userProfile: UserProfile | null = null;

  router = inject(Router);
  route = inject(ActivatedRoute);

  constructor(private fb: FormBuilder) {
    const todayFormatted = this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '';

    this.newExpenseForm = this.fb.group({
      date: [todayFormatted, Validators.required],
      category: ['', Validators.required],
      itemName: ['', Validators.required],
      quantity: [1, [Validators.required, Validators.min(1)]],
      unit: [''],
      price: [0, [Validators.required, Validators.min(0)]],
    });
    
    this.expenses$ = this.expenseService.getExpenses();
    this.categories$ = this.categoryService.getCategories();

    this.displayedExpenses$ = combineLatest([
      this.expenses$,
      this._selectedDate$,
      this._activeCurrencyFilter$,
      this._activeCategoryFilter$,
    ]).pipe(
      map(([expenses, selectedDate, activeCurrency, activeCategory]) => {
        let filtered = expenses.filter(expense => expense.date === selectedDate);

        if (activeCurrency) {
          filtered = filtered.filter(expense => expense.currency === activeCurrency);
        }

        if (activeCategory) {
          filtered = filtered.filter(expense => expense.category === activeCategory);
        }
        return filtered.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
      })
    );

    this.totalExpensesByCurrency$ = this.displayedExpenses$.pipe(
      map(expenses => {
        return expenses.reduce((acc, expense) => {
          acc[expense.currency] = (acc[expense.currency] || 0) + expense.totalCost;
          return acc;
        }, {} as { [key: string]: number });
      })
    );

    const storedLang = localStorage.getItem('selectedLanguage');
    this.translate.use(storedLang || this.translate.getBrowserLang() || 'en');
  }

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const date = params.get('date');
      const initialDate = date || this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '';
      this._selectedDate$.next(initialDate);
    });

    this.authService.userProfile$.subscribe(profile => {
        this.userProfile = profile;
        if (profile?.roles && typeof profile.roles === 'object') {
            this.userRole = Object.values(profile.roles)[0];
        }
    });
    this.loadCategories();
  }
  
  onDateChange(date: string): void {
    this._selectedDate$.next(date);
    this.resetActiveFilters();
  }

  loadCategories(): void {
    this.categories$ = this.categoryService.getCategories();
  }

  openCategoryModal(): void {
    this.categoryModal.open();
  }

  async onSubmitNewExpense(): Promise<void> {
    this.newExpenseForm.markAllAsTouched();
    if (this.newExpenseForm.invalid) {
        this.showErrorModal(this.translate.instant('ERROR_TITLE'), this.translate.instant('ERROR_FILL_ALL_FIELDS'));
        return;
    }

    this.isSaving = true;

    const formValue = this.newExpenseForm.value;
    const newExpense: Omit<IExpense, 'id'> = {
      date: formValue.date,
      category: formValue.category,
      itemName: formValue.itemName,
      quantity: formValue.quantity,
      unit: formValue.unit,
      price: formValue.price,
      currency: this.userProfile?.currency || 'MMK',
      totalCost: formValue.quantity * formValue.price,
    };

    try {
      await this.expenseService.addExpense(newExpense as any);
      this.toastService.showSuccess(this.translate.instant('EXPENSE_SUCCESS_ADDED'));
      this.newExpenseForm.reset({
          date: this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '',
          category: '',
          itemName: '',
          quantity: 1,
          unit: '',
          price: 0
      });
      this.resetFilter();
    } catch (error: any) {
      this.showErrorModal(this.translate.instant('ERROR_TITLE'), error.message || this.translate.instant('EXPENSE_ERROR_ADD'));
    } finally {
      this.isSaving = false;
    }
  }

  resetActiveFilters(): void {
    this._activeCurrencyFilter$.next(null);
    this._activeCategoryFilter$.next(null);
  }

  resetFilter(): void {
    const todayFormatted = this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '';
    this._selectedDate$.next(todayFormatted);
    this.resetActiveFilters();
  }

  filterByCurrency(currency: string): void {
    this._activeCategoryFilter$.next(null);
    this._activeCurrencyFilter$.next(currency);
  }

  filterByCategory(category: string): void {
    this._activeCurrencyFilter$.next(null);
    this._activeCategoryFilter$.next(category);
  }

  startEdit(expense: IExpense): void {
    this.editingExpenseId = expense.id!;
    this.editingForm = this.fb.group({
      date: [expense.date, Validators.required],
      category: [expense.category, Validators.required],
      itemName: [expense.itemName, Validators.required],
      quantity: [expense.quantity, [Validators.required, Validators.min(1)]],
      unit: [expense.unit],
      price: [expense.price, [Validators.required, Validators.min(0)]],
      currency: [expense.currency, Validators.required],
    });
  }

  async saveEdit(): Promise<void> {
    if (!this.editingForm || !this.editingExpenseId) {
      this.showErrorModal(this.translate.instant('ERROR_TITLE'), this.translate.instant('EXPENSE_ERROR_NO_EXPENSE_SELECTED'));
      return;
    }
    if (this.editingForm.invalid) {
      this.showErrorModal(this.translate.instant('ERROR_TITLE'), this.translate.instant('EXPENSE_ERROR_EDIT_FORM_INVALID'));
      return;
    }

    this.isSaving = true;

    const formValue = this.editingForm.value;
    const updatedExpense: Partial<IExpense> = {
      ...formValue,
      totalCost: formValue.quantity * formValue.price,
      updatedAt: new Date().toISOString(),
      updatedByName: this.userProfile?.displayName,
      editedDevice: 'Web Browser'
    };

    try {
      await this.expenseService.updateExpense(this.editingExpenseId, updatedExpense as any);
      this.toastService.showSuccess(this.translate.instant('EXPENSE_SUCCESS_UPDATED'));
      this.cancelEdit();
    } catch (error: any) {
      this.showErrorModal(this.translate.instant('ERROR_TITLE'), error.message || this.translate.instant('EXPENSE_ERROR_UPDATE'));
    } finally {
        this.isSaving = false;
    }
  }

  cancelEdit(): void {
    this.editingExpenseId = null;
    this.editingForm = null;
  }

  onDelete(expenseId: string): void {
    this.deleteConfirmationModal.title = this.translate.instant('CONFIRM_DELETE_TITLE');
    this.deleteConfirmationModal.message = this.translate.instant('CONFIRM_DELETE_EXPENSE');
    this.deleteConfirmationModal.confirmButtonText = this.translate.instant('DELETE_BUTTON');
    this.deleteConfirmationModal.cancelButtonText = this.translate.instant('CANCEL_BUTTON');
    this.deleteConfirmationModal.messageColor = 'text-danger';
    this.deleteConfirmationModal.modalType = 'confirm';

    this.deleteConfirmationModal.open();

    const subscription = this.deleteConfirmationModal.confirmed.subscribe(async (confirmed: boolean) => {
      if (confirmed) {
        this.isSaving = true;
        try {
          await this.expenseService.deleteExpense(expenseId);
          this.toastService.showSuccess(this.translate.instant('EXPENSE_DELETED_SUCCESS'));
        } catch (error: any) {
          this.showErrorModal(this.translate.instant('ERROR_TITLE'), error.message || this.translate.instant('DATA_DELETE_ERROR'));
        } finally {
            this.isSaving = false;
        }
      }
      subscription.unsubscribe();
    });
  }

  showErrorModal(title: string, message: string): void {
    this.errorModal.title = title;
    this.errorModal.message = message;
    this.errorModal.confirmButtonText = this.translate.instant('OK_BUTTON');
    this.errorModal.cancelButtonText = ''; // No cancel button for alert
    this.errorModal.messageColor = 'text-danger';
    this.errorModal.modalType = 'alert';

    this.errorModal.open();
  }
  
  showExpenseInfo(expense: IExpense): void {
    const title = this.translate.instant('EXPENSE_INFO_TITLE');
  
    const infoBlocks: string[] = [
      `<strong>${this.translate.instant('ITEM_NAME_INFO', { itemName: expense.itemName })}</strong>`
    ];
  
    if (expense.createdByName && expense.createdAt) {
      infoBlocks.push(this.translate.instant('CREATED_BY', {
        name: expense.createdByName,
        date: this.formatLocalizedDate(expense.createdAt, 'medium')
      }));
    }
  
    let hasBeenUpdated = false;
    if (expense.createdAt && expense.updatedAt) {
      const createdAtTime = new Date(expense.createdAt).getTime();
      const updatedAtTime = new Date(expense.updatedAt).getTime();
      if (updatedAtTime > createdAtTime + 5000) {
        hasBeenUpdated = true;
      }
    }

    if (hasBeenUpdated) {
      if (expense.updatedByName && expense.updatedAt) {
        infoBlocks.push(this.translate.instant('LAST_UPDATED_BY', {
          name: expense.updatedByName,
          date: this.formatLocalizedDate(expense.updatedAt, 'medium')
        }));
      }
      if (expense.editedDevice) {
        let deviceInfo = this.translate.instant('ON_DEVICE', { device: expense.editedDevice });
        if (deviceInfo.startsWith(' ၊ ')) {
            deviceInfo = deviceInfo.substring(3);
        }
        infoBlocks.push(deviceInfo);
      }
    }
  
    Swal.fire({
      title: title,
      html: infoBlocks.map(block => `<p class="text-start">${block}</p>`).join(''),
      icon: 'info',
      confirmButtonText: this.translate.instant('OK_BUTTON')
    });
  }

  formatLocalizedDate(date: string | Date | null | undefined, format: 'medium' | 'shortDate' = 'shortDate'): string {
    if (!date) return '';
    const d = new Date(date);
    const currentLang = this.translate.currentLang;

    if (currentLang === 'my') {
        const month = this.datePipe.transform(d, 'MMM');
        const burmeseMonth = month ? BURMESE_MONTH_ABBREVIATIONS[month as keyof typeof BURMESE_MONTH_ABBREVIATIONS] : '';
        const day = new Intl.NumberFormat('my-MM', { numberingSystem: 'mymr' }).format(d.getDate());
        const year = new Intl.NumberFormat('my-MM', { numberingSystem: 'mymr' }).format(d.getFullYear());
        const datePart = `${day} ${burmeseMonth}, ${year}`;

        if (format === 'medium') {
            const hour = new Intl.NumberFormat('my-MM', { numberingSystem: 'mymr', minimumIntegerDigits: 2 }).format(d.getHours());
            const minute = new Intl.NumberFormat('my-MM', { numberingSystem: 'mymr', minimumIntegerDigits: 2 }).format(d.getMinutes());
            return `${datePart}, ${hour}:${minute}`;
        }
        return datePart;
    } else {
        return this.datePipe.transform(d, format === 'medium' ? 'medium' : 'mediumDate', undefined, currentLang) || '';
    }
  }

  formatLocalizedNumber(amount: number): string {
    const currentLang = this.translate.currentLang;
    if (currentLang === 'my') {
      return new Intl.NumberFormat('my-MM', { numberingSystem: 'mymr' }).format(amount);
    }
    return amount.toLocaleString(currentLang);
  }
}
