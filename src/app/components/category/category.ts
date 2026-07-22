import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  ChangeDetectorRef,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
  FormControl,
} from '@angular/forms';
import { ServiceICategory, CategoryService, getCategoryErrorMessage } from '../../services/category';
import { Observable, BehaviorSubject, firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth';
import { UserProfile } from '../../services/user-data';

import {
  LucideAngularModule, LucideIconData,
  Plus, Tags, Save, Pencil, Trash2, X, Tag, ImagePlus, EllipsisVertical,
} from 'lucide-angular';
import { CATEGORY_ICONS, getIconData, getIconHue } from '../../utils/category-icons';
import { meaningfulTextValidator } from '../../utils/form-validators';
import { ImageUploadService } from '../../services/image-upload.service';
import { ImageCropperComponent } from '../common/image-cropper/image-cropper.component';

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
    ImageCropperComponent,
  ],
  templateUrl: './category.html',
  styleUrls: ['./category.css'],
})
export class Category implements OnInit, OnDestroy {
  addCategoryForm: FormGroup;
  editingCategoryFormControl: FormControl | null = null;
  editingCategoryId: string | null = null;

  // ── Add Category FAB + Bottom-sheet Modal ──
  isAddModalOpen = false;

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
  readonly iconPen = Pencil;
  readonly iconTrash2 = Trash2;
  readonly iconTimes = X;
  readonly iconImagePlus = ImagePlus;
  readonly iconMoreVertical = EllipsisVertical;

  // Mobile-only three-dot menu (desktop keeps the inline edit/delete
  // buttons — see .cat-item-actions-desktop / .cat-item-actions-mobile in
  // category.css). Same floating-menu pattern as the shared category
  // modal's own list.
  openMenuId: string | null = null;
  menuX = 0;
  menuY = 0;

  toggleMenu(id: string, event: MouseEvent): void {
    event.stopPropagation();
    if (this.openMenuId === id) {
      this.openMenuId = null;
      return;
    }
    const btn = event.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    this.menuY = rect.bottom + 4;
    this.menuX = rect.right - 128;
    this.openMenuId = id;
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.openMenuId = null;
  }

  readonly categoryIcons = CATEGORY_ICONS;
  readonly defaultIcon = Tag;

  selectedAddIcon = 'tag';
  selectedAddIconData: LucideIconData = Tag;
  selectedAddIconUrl: string | null = null;
  isUploadingAddIcon = false;
  showAddIconPicker = false;

  selectedEditIcon = 'tag';
  selectedEditIconData: LucideIconData = Tag;
  selectedEditIconUrl: string | null = null;
  isUploadingEditIcon = false;
  showEditIconPicker = false;

  getIconData = getIconData;
  getIconHue = getIconHue;

  private imageUploadService = inject(ImageUploadService);

  selectAddIcon(name: string): void {
    this.selectedAddIcon = name;
    this.selectedAddIconData = getIconData(name);
    this.selectedAddIconUrl = null;
    this.showAddIconPicker = false;
  }

  selectEditIcon(name: string): void {
    this.selectedEditIcon = name;
    this.selectedEditIconData = getIconData(name);
    this.selectedEditIconUrl = null;
    this.showEditIconPicker = false;
  }

  // File picked → open the 1:1 cropper first; upload happens on confirm.
  pendingCropFile: File | null = null;
  private pendingCropMode: 'add' | 'edit' = 'add';

  onIconFileSelected(event: Event, mode: 'add' | 'edit'): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow re-picking the same file later
    if (!file) return;
    this.pendingCropMode = mode;
    this.pendingCropFile = file;
  }

  onCropCancelled(): void {
    this.pendingCropFile = null;
  }

  async onCropped(file: File): Promise<void> {
    const mode = this.pendingCropMode;
    this.pendingCropFile = null;

    if (mode === 'add') this.isUploadingAddIcon = true;
    else this.isUploadingEditIcon = true;

    try {
      // Cropper already exports a square 256px JPEG — upload it as-is.
      const url = await this.imageUploadService.uploadCategoryIcon(file);
      if (mode === 'add') {
        this.selectedAddIconUrl = url;
        this.showAddIconPicker = false;
      } else {
        this.selectedEditIconUrl = url;
        this.showEditIconPicker = false;
      }
    } catch (error) {
      console.error('Category icon upload failed:', error);
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        this.translateService.instant('AVATAR_UPLOAD_ERROR'),
      );
    } finally {
      this.isUploadingAddIcon = false;
      this.isUploadingEditIcon = false;
      this.cdr.detectChanges();
    }
  }

  toggleAddIconPicker(event: MouseEvent): void {
    this.showAddIconPicker = !this.showAddIconPicker;
    if (this.showAddIconPicker) {
      this.scrollPickerIntoView(event.currentTarget as HTMLElement);
    }
  }

  toggleEditIconPicker(event: MouseEvent): void {
    this.showEditIconPicker = !this.showEditIconPicker;
    if (this.showEditIconPicker) {
      this.scrollPickerIntoView(event.currentTarget as HTMLElement);
    }
  }

  private scrollPickerIntoView(trigger: HTMLElement): void {
    setTimeout(() => {
      const container = trigger.closest('.cat-item-edit, .cat-add-form-wrap, form');
      const picker = (container ?? document).querySelector('.cat-icon-picker') as HTMLElement;
      if (!picker) return;
      const rect = picker.getBoundingClientRect();
      const navBarHeight = 70;
      const gap = 12;
      const overflow = rect.bottom + navBarHeight + gap - window.innerHeight;
      if (overflow > 0) {
        window.scrollBy({ top: overflow, behavior: 'smooth' });
      }
    }, 60);
  }

  constructor(private fb: FormBuilder) {
    this.addCategoryForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(50), meaningfulTextValidator]],
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
        this.closeAddModal();
      }
    });
  }

  ngOnDestroy(): void {
    document.body.classList.remove('cat-add-modal-open');
  }

  openAddModal(): void {
    this.isAddModalOpen = true;
    document.body.classList.add('cat-add-modal-open');
  }

  closeAddModal(): void {
    this.isAddModalOpen = false;
    this.showAddIconPicker = false;
    document.body.classList.remove('cat-add-modal-open');
  }

  private getSpaceModeKey(profile: UserProfile | null): string {
    if (!profile) return 'none';
    const type = profile.currentSpaceType || profile.accountType || 'personal';
    const id = profile.currentSpaceId || profile.groupId || profile.personalSpaceId || profile.uid;
    return `${type}:${id}`;
  }

  trackByIconName(index: number, opt: { name: string }): string {
    return opt.name;
  }

  trackByCategoryId(index: number, category: ServiceICategory): string {
    return category.id ?? String(index);
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
      await this.categoryService.addCategory(categoryName, this.selectedAddIcon, this.selectedAddIconUrl);
      Toast.fire({ icon: 'success', title: this.translateService.instant('CATEGORY_ADDED_SUCCESS') });
      this.addCategoryForm.reset();
      this.selectedAddIcon = 'tag';
      this.selectedAddIconData = Tag;
      this.selectedAddIconUrl = null;
      this.showAddIconPicker = false;
      this.closeAddModal();
      await this.loadCategories();
    } catch (error: any) {
      const key = getCategoryErrorMessage(error) || 'DATA_SAVE_ERROR';
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        this.translateService.instant(key)
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
      [Validators.required, Validators.maxLength(50), meaningfulTextValidator]
    );
    this.selectedEditIcon = category.icon || 'tag';
    this.selectedEditIconData = this.getIconData(category.icon);
    this.selectedEditIconUrl = category.iconUrl ?? null;
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
        this.selectedEditIcon,
        this.selectedEditIconUrl
      );
      Toast.fire({ icon: 'success', title: this.translateService.instant('CATEGORY_SUCCESS_UPDATED') });
      this.cancelEdit();
      this.loadCategories(); // Reload to reflect changes
    } catch (error: any) {
      const key = getCategoryErrorMessage(error) || 'CATEGORY_ERROR_UPDATE';
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        this.translateService.instant(key)
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
