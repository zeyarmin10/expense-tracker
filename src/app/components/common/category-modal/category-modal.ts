import { Component, ElementRef, EventEmitter, OnInit, Output, ViewChild, inject, HostListener } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CategoryService } from '../../../services/category';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { faSave, faTimes, faPlus, faEdit, faTrash, faTags } from '@fortawesome/free-solid-svg-icons';
import { faTrashCan, faPenToSquare } from '@fortawesome/free-regular-svg-icons';
import { FaIconComponent } from "@fortawesome/angular-fontawesome";
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { ServiceICategory } from '../../../services/category';
import Swal from 'sweetalert2';

declare const bootstrap: any;

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
  selector: 'app-category-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, FaIconComponent],
  templateUrl: './category-modal.html',
  styleUrls: ['./category-modal.css']
})
export class CategoryModalComponent implements OnInit {
  @Output() categoryAdded = new EventEmitter<void>();

  categoryForm: FormGroup;
  categoryService = inject(CategoryService);
  translateService = inject(TranslateService);

  categories: ServiceICategory[] = [];
  isEditMode = false;
  editingCategoryId: string | null = null;
  isModalOpen = false;
  deletingStates: { [key: string]: boolean } = {};

  private bsModal: any;

  private categories$ = new BehaviorSubject<ServiceICategory[]>([]);

  faSave = faSave;
  faTimes = faTimes;
  faPlus = faPlus;
  faEdit = faEdit;
  faTrash = faTrash;
  faTags = faTags;
  faTrashCan = faTrashCan;
  faPenToSquare = faPenToSquare;

  @HostListener('window:popstate', ['$event'])
  onPopState(event: PopStateEvent): void {
    if (this.isModalOpen) {
      this.bsModal.hide();
    }
  }

  constructor(private fb: FormBuilder) {
    this.categoryForm = this.fb.group({
      name: ['', Validators.required]
    });
  }

  ngOnInit(): void {
    this.categories$.subscribe(categories => {
      this.categories = categories;
    });
  }

  private async initializeModal(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.bsModal) {
        const modalElement = document.getElementById('categoryModal');
        if (modalElement) {
          this.bsModal = new bootstrap.Modal(modalElement);
          modalElement.addEventListener('hidden.bs.modal', () => {
            this.isModalOpen = false;
            this.resetForm();
          });
        }
      }
      resolve();
    });
  }

  async open(): Promise<void> {
    await this.initializeModal();
    await this.loadCategories();
    this.resetForm();


    const modalElement = document.getElementById('categoryModal');
    if (modalElement) {
      // When the modal is fully hidden, update the flag.
      modalElement.addEventListener('hidden.bs.modal', () => {
        this.isModalOpen = false;
      }, { once: true });

      modalElement.addEventListener('shown.bs.modal', () => {
        const inputElement = document.getElementById('catNameInput');
        if (inputElement) {
          inputElement.focus();
        }
      }, { once: true });

      this.bsModal = new bootstrap.Modal(modalElement);

    // Push state to browser history and update flag before showing
      history.pushState(null, '');
      this.isModalOpen = true;
      this.bsModal.show();
    }
  }

  closeModal(): void {
    if (this.isModalOpen) {
      history.back();
    } else {
      this.bsModal.hide();
    }
  }

  private async loadCategories(): Promise<void> {
    try {
      const categories = await firstValueFrom(this.categoryService.getCategories());
      this.categories$.next(categories);
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  }

  onEdit(category: ServiceICategory): void {
    this.isEditMode = true;
    this.editingCategoryId = category.id!;
    this.categoryForm.setValue({ name: category.name });
  }

  resetForm(): void {
    this.isEditMode = false;
    this.editingCategoryId = null;
    this.categoryForm.reset();
  }

  isDeleting(categoryId: string): boolean {
    return this.deletingStates[categoryId];
  }

  async onSave(): Promise<void> {
    if (this.categoryForm.invalid) {
      return;
    }

    const categoryName = this.categoryForm.value.name;

    try {
      if (this.isEditMode && this.editingCategoryId) {
        await this.categoryService.updateCategory(this.editingCategoryId, categoryName);
        Toast.fire({ icon: 'success', title: this.translateService.instant('CATEGORY_SUCCESS_UPDATED') });
      } else {
        await this.categoryService.addCategory(categoryName);
        Toast.fire({ icon: 'success', title: this.translateService.instant('CATEGORY_ADDED_SUCCESS') });
      }
      await this.loadCategories();
      this.categoryAdded.emit();
      this.resetForm();
    } catch (error) {
      console.error('Error saving category:', error);
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
              this.resetForm();
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
