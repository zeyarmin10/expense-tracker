import { Component, EventEmitter, inject, OnDestroy, Output } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { CalendarRange, LucideAngularModule, Save, X } from 'lucide-angular';
import { DateInputComponent } from '../date-input/date-input.component';
import { DateRangeInputComponent } from '../date-range-input/date-range-input.component';

@Component({
  selector: 'app-custom-budget-period-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TranslateModule, LucideAngularModule, DateInputComponent, DateRangeInputComponent],
  templateUrl: './custom-budget-period-modal.component.html',
  styleUrls: ['./custom-budget-period-modal.component.css'],
})
export class CustomBudgetPeriodModalComponent implements OnDestroy {
  @Output() periodSaved = new EventEmitter<{ name: string; startDate: string; endDate: string }>();

  private formBuilder = inject(FormBuilder);
  budgetPeriodForm: FormGroup;
  isModalOpen = false;

  readonly iconSave = Save;
  readonly iconTimes = X;
  readonly iconCalendarRange = CalendarRange;

  constructor() {
    this.budgetPeriodForm = this.formBuilder.group({
      name: ['', [Validators.required, Validators.maxLength(50)]],
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

    this.isModalOpen = true;
    document.body.classList.add('cbp-modal-open');
    setTimeout(() => document.getElementById('budgetName')?.focus(), 0);
  }

  close(): void {
    this.isModalOpen = false;
    document.body.classList.remove('cbp-modal-open');
  }

  save(): void {
    if (this.budgetPeriodForm.valid) {
      const v = this.budgetPeriodForm.value;
      this.periodSaved.emit({ ...v, name: (v.name || '').trim() });
      this.close();
    }
  }

  ngOnDestroy(): void {
    document.body.classList.remove('cbp-modal-open');
  }
}
