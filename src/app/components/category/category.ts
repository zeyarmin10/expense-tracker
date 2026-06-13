import {
  Component,
  OnInit,
  inject,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
  FormControl,
} from '@angular/forms';
import { ServiceICategory, CategoryService } from '../../services/category';
import { Observable, BehaviorSubject, firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth';
import { UserProfile } from '../../services/user-data';

import {
  LucideAngularModule, LucideIconData,
  Plus, Tags, Save, Pen, Trash2, X, Tag,
} from 'lucide-angular';
import { CATEGORY_ICONS, getIconData, getCategoryHue } from '../../utils/category-icons';

import { TranslateService, TranslateModule } from '@ngx-translate/core';
import Swal from 'sweetalert2';
import { CurrentSpaceTitleComponent } from '../common/current-space-title/current-space-title.component';

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
  selector: 'app-category',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    CurrentSpaceTitleComponent,
    LucideAngularModule,
  ],
  templateUrl: './category.html',
  styleUrls: ['./category.css'],
})
export class Category implements OnInit {
  addCategoryForm: FormGroup;
  editingCategoryFormControl: FormControl | null = null;
  editingCategoryId: string | null = null;

  private _categoriesSubject: BehaviorSubject<ServiceICategory[]> =
    new BehaviorSubject<ServiceICategory[]>([]);
  categories$: Observable<ServiceICategory[]> =
    this._categoriesSubject.asObservable();

  categoryService = inject(CategoryService);
  translateService = inject(TranslateService);
  private cdr = inject(ChangeDetectorRef);
  private authService = inject(AuthService);
  private activeSpaceModeKey: string | null = null;

  readonly iconPlus = Plus;
  readonly iconTags = Tags;
  readonly iconSave = Save;
  readonly iconPen = Pen;
  readonly iconTrash2 = Trash2;
  readonly iconTimes = X;

  readonly categoryIcons = CATEGORY_ICONS;
  readonly defaultIcon = Tag;

  selectedAddIcon = 'tag';
  selectedAddIconData: LucideIconData = Tag;
  showAddIconPicker = false;

  selectedEditIcon = 'tag';
  selectedEditIconData: LucideIconData = Tag;
  showEditIconPicker = false;

  getIconData = getIconData;
  getCategoryHue = getCategoryHue;

  selectAddIcon(name: string): void {
    this.selectedAddIcon = name;
    this.selectedAddIconData = getIconData(name);
    this.showAddIconPicker = false;
  }

  selectEditIcon(name: string): void {
    this.selectedEditIcon = name;
    this.selectedEditIconData = getIconData(name);
    this.showEditIconPicker = false;
  }

  constructor(private fb: FormBuilder) {
    this.addCategoryForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(30)]],
    });
  }

  ngOnInit(): void {
    this.loadCategories();
    this.authService.userProfile$.subscribe((profile) => {
      const key = this.getSpaceModeKey(profile);
      if (key !== this.activeSpaceModeKey) {
        this.activeSpaceModeKey = key;
        this.editingCategoryId = null;
        this.editingCategoryFormControl = null;
        this.addCategoryForm.reset();
        this.loadCategories();
      }
    });
  }

  private getSpaceModeKey(profile: UserProfile | null): string {
    if (!profile) return 'none';
    const type = profile.currentSpaceType || profile.accountType || 'personal';
    const id = profile.currentSpaceId || profile.groupId || profile.personalSpaceId || profile.uid;
    return `${type}:${id}`;
  }

  public async loadCategories(): Promise<void> {
    try {
      const categories = await firstValueFrom(
        this.categoryService.getCategories()
      );
      this._categoriesSubject.next(categories);
    } catch (error) {
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        (error as any).message ||
        this.translateService.instant('DATA_LOAD_ERROR')
      );
      console.error('Error loading categories:', error);
    }
  }

  async onAddSubmit(): Promise<void> {
    if (this._categoriesSubject.value.length >= 100) {
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        this.translateService.instant('CATEGORY_LIMIT_REACHED')
      );
      return;
    }

    if (this.addCategoryForm.invalid) {
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        this.translateService.instant('CATEGORY_NAME_REQUIRED')
      );
      return;
    }

    const categoryName = this.addCategoryForm.value.name.trim();

    const categories = this._categoriesSubject.value;
    const isDuplicate = categories.some(
      (category) => category.name.toLowerCase() === categoryName.toLowerCase()
    );

    if (isDuplicate) {
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        this.translateService.instant('CATEGORY_ALREADY_EXISTS')
      );
      return;
    }

    try {
      await this.categoryService.addCategory(categoryName, this.selectedAddIcon);
      Toast.fire({ icon: 'success', title: this.translateService.instant('CATEGORY_ADDED_SUCCESS') });
      this.addCategoryForm.reset();
      this.selectedAddIcon = 'tag';
      this.selectedAddIconData = Tag;
      this.showAddIconPicker = false;
      await this.loadCategories();
    } catch (error: any) {
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        error.message || this.translateService.instant('DATA_SAVE_ERROR')
      );
      console.error('Category add error:', error);
    }
  }

  startEdit(category: ServiceICategory): void {
    if (this.editingCategoryId !== null) {
      return;
    }
    this.editingCategoryId = category.id!;
    this.editingCategoryFormControl = new FormControl(
      category.name,
      [Validators.required, Validators.maxLength(30)]
    );
    this.selectedEditIcon = category.icon || 'tag';
    this.selectedEditIconData = this.getIconData(category.icon);
    this.showEditIconPicker = false;
  }

  cancelEdit(): void {
    this.editingCategoryId = null;
    this.editingCategoryFormControl = null;
    this.showEditIconPicker = false;
  }

  async onUpdateInline(
    categoryId: string
  ): Promise<void> {
    if (
      this.editingCategoryFormControl &&
      this.editingCategoryFormControl.invalid
    ) {
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        this.translateService.instant('CATEGORY_NAME_REQUIRED')
      );
      return;
    }
    if (!this.editingCategoryFormControl || !categoryId) {
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        this.translateService.instant('CATEGORY_ERROR_UPDATE_INVALID')
      );
      return;
    }

    const newCategoryName = (this.editingCategoryFormControl.value || '').trim();
    try {
      await this.categoryService.updateCategory(
        categoryId,
        newCategoryName,
        this.selectedEditIcon
      );
      Toast.fire({ icon: 'success', title: this.translateService.instant('CATEGORY_SUCCESS_UPDATED') });
      this.cancelEdit();
      this.loadCategories(); // Reload to reflect changes
    } catch (error: any) {
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        error.message || this.translateService.instant('CATEGORY_ERROR_UPDATE')
      );
      console.error('Error updating category:', error);
    }
  }

  async onDelete(categoryId: string): Promise<void> {
    try {
      const isUsed = await this.categoryService.isCategoryUsedInExpenses(
        categoryId
      );

      if (isUsed) {
        this.showErrorModal(
          this.translateService.instant('DELETE_CATEGORY_ERROR_TITLE'),
          this.translateService.instant('CATEGORY_IN_USE_ERROR')
        );
        return;
      }

      const confirmMsg = await firstValueFrom(
        this.translateService.get('CONFIRM_DELETE_CATEGORY')
      );

      Swal.fire({
        title: this.translateService.instant('CONFIRM_DELETE_TITLE'),
        text: confirmMsg,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: this.translateService.instant('DELETE_BUTTON'),
        cancelButtonText: this.translateService.instant('CANCEL_BUTTON'),
        reverseButtons: true
      }).then(async (result) => {
        if (result.isConfirmed) {
          try {
            await this.categoryService.deleteCategory(categoryId);
            Toast.fire({ icon: 'success', title: this.translateService.instant('CATEGORY_DELETED_SUCCESS') });
            if (this.editingCategoryId === categoryId) {
              this.cancelEdit();
            }
            await this.loadCategories();
          } catch (error: any) {
            this.showErrorModal(
              this.translateService.instant('ERROR_TITLE'),
              error.message ||
              this.translateService.instant('DATA_DELETE_ERROR')
            );
          }
        }
      });
    } catch (error: any) {
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        error.message ||
        this.translateService.instant('FAILED_CHECK_CATEGORY_USAGE')
      );
    }
  }

  showErrorModal(title: string, message: string): void {
    Swal.fire({
      icon: 'error',
      title: title,
      text: message,
      confirmButtonText: this.translateService.instant('OK_BUTTON')
    });
  }
}
