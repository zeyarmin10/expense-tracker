import { Component, ElementRef, EventEmitter, OnInit, Output, ViewChild, inject, HostListener } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CategoryService } from '../../../services/category';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { faSave, faTimes, faPlus, faEdit, faTrash } from '@fortawesome/free-solid-svg-icons';
import { FaIconComponent } from "@fortawesome/angular-fontawesome";
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { ServiceICategory } from '../../../services/category';
import Swal from 'sweetalert2';

declare const bootstrap: any;

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

    history.pushState(null, '');
    this.isModalOpen = true;
    this.bsModal.show();
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
      } else {
        await this.categoryService.addCategory(categoryName);
      }
      await this.loadCategories();
      this.categoryAdded.emit();
      this.resetForm();
    } catch (error) {
      console.error('Error saving category:', error);
    }
  }

  async onDelete(categoryId: string): Promise<void> {
    this.deletingStates[categoryId] = true;
    try {
      await this.categoryService.deleteCategory(categoryId);
      await this.loadCategories();
      this.categoryAdded.emit();
    } catch (error) {
      console.error(`Error deleting category ${categoryId}:`, error);
    } finally {
      this.deletingStates[categoryId] = false;
    }
  }

}
