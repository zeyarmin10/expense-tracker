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
    const today = new Date();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(today.getMonth() - 6);
    const sixMonthsHence = new Date();
    sixMonthsHence.setMonth(today.getMonth() + 6);

    const sixMonthsAgoString = sixMonthsAgo.toISOString().split('T')[0];
    const sixMonthsHenceString = sixMonthsHence.toISOString().split('T')[0];

    this.budgetPeriodForm.reset({
      name: '',
      startDate: sixMonthsAgoString,
      endDate: sixMonthsHenceString
    });

    const modalElement = document.getElementById('customBudgetPeriodModal');
    if (modalElement) {
      // Set up autofocus when the modal is shown
      modalElement.addEventListener('shown.bs.modal', () => {
        const inputElement = document.getElementById('budgetName');
        if (inputElement) {
          inputElement.focus();
        }
      }, { once: true });

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
