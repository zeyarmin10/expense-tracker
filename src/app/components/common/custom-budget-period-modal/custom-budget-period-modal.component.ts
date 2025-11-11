import { Component, EventEmitter, inject, Output } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faSave } from '@fortawesome/free-solid-svg-icons';

declare var bootstrap: any;

@Component({
  selector: 'app-custom-budget-period-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TranslateModule, FontAwesomeModule],
  templateUrl: './custom-budget-period-modal.component.html',
  styleUrls: ['./custom-budget-period-modal.component.css'],
})
export class CustomBudgetPeriodModalComponent {
  @Output() periodSaved = new EventEmitter<{ name: string; startDate: string; endDate: string }>();

  private formBuilder = inject(FormBuilder);
  budgetPeriodForm: FormGroup;
  private modalInstance: any;

  faSave = faSave;

  constructor() {
    this.budgetPeriodForm = this.formBuilder.group({
      name: ['', Validators.required],
      startDate: ['', Validators.required],
      endDate: ['', Validators.required],
    });
  }

  open(): void {
    this.budgetPeriodForm.reset();
    const modalElement = document.getElementById('customBudgetPeriodModal');
    if (modalElement) {
      this.modalInstance = new bootstrap.Modal(modalElement);
      this.modalInstance.show();
    }
  }

  close(): void {
    if (this.modalInstance) {
      this.modalInstance.hide();
    }
  }

  save(): void {
    if (this.budgetPeriodForm.valid) {
      this.periodSaved.emit(this.budgetPeriodForm.value);
      this.close();
    }
  }
}
