import { Component, ElementRef, EventEmitter, OnInit, Output, ViewChild, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CategoryService } from '../../../services/category'; // Assuming your CategoryService is here
import { CommonModule } from '@angular/common';

// Declare bootstrap as any to access Bootstrap's JS API
declare const bootstrap: any;

@Component({
  selector: 'app-category-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './category-modal.html',
  styleUrls: ['./category-modal.css']
})
export class CategoryModalComponent implements OnInit {
  @ViewChild('categoryModal') modalElementRef!: ElementRef; // Reference to the modal HTML element
  @Output() categoryAdded = new EventEmitter<void>(); // Event to notify parent on success

  categoryForm: FormGroup;
  categoryService = inject(CategoryService);

  errorMessage: string | null = null;
  successMessage: string | null = null;

  private bsModal!: any; // To store the Bootstrap modal instance

  constructor(private fb: FormBuilder) {
    this.categoryForm = this.fb.group({
      name: ['', Validators.required]
    });
  }

  ngOnInit(): void {
    // Initialize Bootstrap modal when the component view is ready
    // This is safe to do here because @ViewChild('categoryModal') will be ready
  }

  ngAfterViewInit(): void {
    if (this.modalElementRef) {
      this.bsModal = new bootstrap.Modal(this.modalElementRef.nativeElement);
      // Optional: Listen to modal hidden event to reset form
      this.modalElementRef.nativeElement.addEventListener('hidden.bs.modal', () => {
        this.resetForm();
      });
    }
  }

  open(): void {
    this.errorMessage = null;
    this.successMessage = null;
    this.resetForm(); // Ensure form is clean when opening
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
    this.errorMessage = null;
    this.successMessage = null;
  }

  async onSubmit(): Promise<void> {
    this.errorMessage = null;
    this.successMessage = null;

    if (this.categoryForm.invalid) {
      this.errorMessage = 'Category name ကို ဖြည့်ရန်လိုအပ်ပါသည်။';
      return;
    }

    const newCategoryName = this.categoryForm.value.name;

    try {
      await this.categoryService.addCategory(newCategoryName);
      this.successMessage = 'Category added successfully!';
      this.categoryForm.reset();
      this.categoryAdded.emit(); // Emit event to notify parent
      // Optionally, close modal after a short delay or immediately
      setTimeout(() => {
        this.close();
      }, 1500); // Close after 1.5 seconds
    } catch (error: any) {
      this.errorMessage = error.message || ' Category ကို ထည့်ရာတွင် အမှားတစ်ခုဖြစ်သွားသည်။';
      console.error('Error adding category:', error);
    }
  }
}