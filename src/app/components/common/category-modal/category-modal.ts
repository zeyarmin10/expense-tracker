import { Component, ElementRef, EventEmitter, OnInit, Output, ViewChild, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CategoryService } from '../../../services/category';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { faSave, faTimes } from '@fortawesome/free-solid-svg-icons';
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
  @ViewChild('categoryModal') modalElementRef!: ElementRef;
  @Output() categoryAdded = new EventEmitter<void>();

  categoryForm: FormGroup;
  categoryService = inject(CategoryService);
  translateService = inject(TranslateService);

  private _modalCurrentCategoryCount: number = 0;

  faSave = faSave;
  faTimes = faTimes;

  private bsModal!: any;

  private _categoriesSubject: BehaviorSubject<ServiceICategory[]> = new BehaviorSubject<ServiceICategory[]>([]);
  

  constructor(private fb: FormBuilder) {
    this.categoryForm = this.fb.group({
      name: ['', Validators.required]
    });
  }

  ngOnInit(): void {
  }

  ngAfterViewInit(): void {
    if (this.modalElementRef) {
      this.bsModal = new bootstrap.Modal(this.modalElementRef.nativeElement);
      this.modalElementRef.nativeElement.addEventListener('hidden.bs.modal', () => {
        this.resetForm();
      });
    }
  }

  async open(): Promise<void> {
    this.resetForm();
    try {
      const categories = await firstValueFrom(this.categoryService.getCategories());
      this._modalCurrentCategoryCount = categories.length;
      this._categoriesSubject.next(categories);
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: this.translateService.instant('ERROR_TITLE'),
        text: (error as any).message || this.translateService.instant('DATA_LOAD_ERROR')
      });
      console.error('Error loading categories for modal:', error);
      this._modalCurrentCategoryCount = 0;
    }

    if (this.bsModal) {
      this.bsModal.show();
    }
  }

  close(): void {
    if (this.bsModal) {
      this.bsModal.hide();
    }
  }

  resetForm(): void {
    this.categoryForm.reset();
  }

  async onSubmit(): Promise<void> {
    if (this._modalCurrentCategoryCount >= 100) {
      Swal.fire({
        icon: 'error',
        title: this.translateService.instant('ERROR_TITLE'),
        text: this.translateService.instant('CATEGORY_LIMIT_REACHED')
      });
      this.close();
      return;
    }

    if (this.categoryForm.invalid) {
        Swal.fire({
            icon: 'error',
            title: this.translateService.instant('ERROR_TITLE'),
            text: this.translateService.instant('CATEGORY_NAME_REQUIRED')
          });
      return;
    }

    const newCategoryName = this.categoryForm.value.name;

    const categories = this._categoriesSubject.value;
    const isDuplicate = categories.some(category => category.name.toLowerCase() === newCategoryName.toLowerCase());

    if (isDuplicate) {
        Swal.fire({
            icon: 'error',
            title: this.translateService.instant('ERROR_TITLE'),
            text: this.translateService.instant('CATEGORY_ALREADY_EXISTS')
        });
        this.close();
        return;
    }

    try {
      await this.categoryService.addCategory(newCategoryName);
      Swal.fire({
        icon: 'success',
        title: this.translateService.instant('CATEGORY_ADDED_SUCCESS'),
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true
      });
      this.categoryForm.reset();
      this.categoryAdded.emit();

      this._modalCurrentCategoryCount++;
      this.close();
    } catch (error: any) {
        Swal.fire({
            icon: 'error',
            title: this.translateService.instant('ERROR_TITLE'),
            text: error.message || this.translateService.instant('DATA_SAVE_ERROR')
          });
      console.error('Error adding category:', error);
    }
  }
}