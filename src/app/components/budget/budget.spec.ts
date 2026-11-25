import { DatePipe } from '@angular/common';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, of } from 'rxjs';

import { BudgetComponent } from './budget';
import { AuthService } from '../../services/auth';
import { BudgetService, ServiceIBudget } from '../../services/budget';
import { CategoryService } from '../../services/category';
import { DateFilterService, toLocalDateKey } from '../../services/date-filter.service';
import { ExpenseService } from '../../services/expense';
import { UserProfile } from '../../services/user-data';
import { DateRangeInputComponent } from '../common/date-range-input/date-range-input.component';

describe('BudgetComponent', () => {
  let fixture: ComponentFixture<BudgetComponent>;
  let component: BudgetComponent;
  let page: HTMLElement;
  let budgets: BehaviorSubject<ServiceIBudget[]>;
  let updateBudget: jasmine.Spy;

  const today = toLocalDateKey(new Date());
  const earlierDate = toLocalDateKey(new Date(new Date().getFullYear() - 1, 1, 12));
  const groceries: ServiceIBudget = {
    id: 'groceries-limit',
    type: 'monthly',
    category: 'Groceries',
    amount: 200,
    currency: 'USD',
    period: today,
    device: 'test',
  };
  const profile: UserProfile = {
    uid: 'budget-test',
    email: 'budget@example.test',
    displayName: 'Budget test',
    currency: 'USD',
    language: 'en',
    createdAt: 0,
    accountType: 'personal',
    budgetPeriod: 'yearly',
  };

  beforeEach(async () => {
    budgets = new BehaviorSubject([groceries]);
    updateBudget = jasmine.createSpy('updateBudget').and.resolveTo('updated');

    await TestBed.configureTestingModule({
      imports: [BudgetComponent, TranslateModule.forRoot()],
      providers: [
        DatePipe,
        { provide: AuthService, useValue: { userProfile$: of(profile) } },
        { provide: BudgetService, useValue: { getBudgets: () => budgets, updateBudget } },
        { provide: CategoryService, useValue: { getCategories: () => of([{ id: 'groceries', name: 'Groceries' }]) } },
        { provide: ExpenseService, useValue: {
          getExpenses: () => of([
            { id: 'receipt', date: today, currency: 'USD', category: 'Groceries', totalCost: 260 },
            { id: 'other-currency', date: today, currency: 'MMK', category: 'Groceries', totalCost: 5000 },
            { id: 'travel-receipt', date: earlierDate, currency: 'USD', category: 'Travel', totalCost: 40 },
          ]),
        } },
      ],
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    spyOn(translate, 'getBrowserLang').and.returnValue('en');
    spyOn(history, 'pushState');
    spyOn(history, 'back');

    fixture = TestBed.createComponent(BudgetComponent);
    component = fixture.componentInstance;
    page = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('shows the deficit and caps the meter while reporting the actual percentage', () => {
    const summary = page.querySelector('.bgt-overview')!;
    const meter = summary.querySelector('[role="meter"]')!;
    const amount = summary.querySelector('.bgt-overview-amount');

    expect(summary.getAttribute('data-level')).toBe('over');
    expect(amount?.getAttribute('data-balance')).toBe('deficit');
    expect(amount?.textContent).toContain('60');
    expect(amount?.nextElementSibling?.textContent?.trim()).toBe('sixty US dollars');
    expect(meter.getAttribute('aria-valuenow')).toBe('100');
    expect(meter.getAttribute('aria-valuetext')).toContain('130');
  });

  it('marks a positive balance even when usage is near the limit and leaves zero neutral', () => {
    budgets.next([{ ...groceries, amount: 270 }]);
    fixture.detectChanges();

    expect(page.querySelector('.bgt-overview')?.getAttribute('data-level')).toBe('near');
    expect(page.querySelector('.bgt-overview-amount')?.getAttribute('data-balance')).toBe('remaining');

    budgets.next([{ ...groceries, amount: 260 }]);
    fixture.detectChanges();

    expect(page.querySelector('.bgt-overview-amount')?.hasAttribute('data-balance')).toBeFalse();
  });

  it('shows the amount in words below the recorded budget amount', () => {
    const amount = page.querySelector('.bgt-budget-card-amount');

    expect(amount?.textContent).toBe('$200.00');
    expect(amount?.nextElementSibling?.textContent?.trim()).toBe('two hundred US dollars');
  });

  it('opens the calendar from This Month and applies the new budget and expense range', fakeAsync(() => {
    budgets.next([groceries, { ...groceries, id: 'travel-limit', category: 'Travel', period: earlierDate, amount: 500 }]);
    const filterBar = fixture.debugElement.query(By.css('.exp-filter-bar'));
    const [currentMonth, , , custom] = filterBar.nativeElement.querySelectorAll('.exp-seg-btn');
    currentMonth.click();
    fixture.detectChanges();
    const currentRange = component.dateFilter$.value;
    expect(page.querySelector('.bgt-records')?.textContent).toContain('Groceries');
    expect(page.querySelector('.bgt-records')?.textContent).not.toContain('Travel');

    custom.click();
    fixture.detectChanges();

    const picker = filterBar.query(By.directive(DateRangeInputComponent));
    expect(picker.componentInstance.isOpen).toBeTrue();
    expect(currentMonth.getAttribute('aria-pressed')).toBe('true');
    expect(custom.getAttribute('aria-expanded')).toBe('true');
    expect(component.dateFilter$.value).toEqual(currentRange);

    const range = { start: earlierDate, end: earlierDate };
    picker.triggerEventHandler('rangeChange', range);
    fixture.detectChanges();

    expect(custom.getAttribute('aria-pressed')).toBe('true');
    expect(component.dateFilter$.value).toEqual(range);
    expect(picker.componentInstance.startDate).toBe(range.start);
    expect(picker.componentInstance.endDate).toBe(range.end);
    expect(page.querySelector('.bgt-records')?.textContent).toContain('Travel');
    expect(page.querySelector('.bgt-records')?.textContent).not.toContain('Groceries');
    expect(page.querySelector('.bgt-overview-amount')?.textContent).toContain('460');
    picker.componentInstance.close();
    tick(220);
    fixture.detectChanges();
    expect(component.dateFilter$.value).toEqual(range);
  }));

  it('applies the past 12 months as Custom when the calendar closes without a date range', fakeAsync(() => {
    const now = new Date();
    const previousMonth = toLocalDateKey(new Date(now.getFullYear(), now.getMonth() - 1, 15));
    const outsideRange = toLocalDateKey(new Date(now.getFullYear(), now.getMonth() - 13, 15));
    budgets.next([
      groceries,
      { ...groceries, id: 'rent-limit', category: 'Rent', period: previousMonth },
      { ...groceries, id: 'travel-limit', category: 'Travel', period: outsideRange },
    ]);
    const filterBar = fixture.debugElement.query(By.css('.exp-filter-bar'));
    const [currentMonth, , , custom] = filterBar.nativeElement.querySelectorAll('.exp-seg-btn');
    currentMonth.click();
    fixture.detectChanges();
    expect(page.querySelector('.bgt-records')?.textContent).not.toContain('Rent');

    custom.click();
    fixture.detectChanges();

    filterBar.query(By.directive(DateRangeInputComponent)).componentInstance.close();
    tick(220);
    fixture.detectChanges();

    const expectedRange = TestBed.inject(DateFilterService).getDateRange(component.datePipe, 'last12Months');
    expect(component.dateFilter$.value).toEqual(expectedRange);
    expect(custom.getAttribute('aria-expanded')).toBe('false');
    expect(custom.getAttribute('aria-pressed')).toBe('true');
    const picker = filterBar.query(By.directive(DateRangeInputComponent)).componentInstance;
    expect(picker.startDate).toBe(expectedRange.start);
    expect(picker.endDate).toBe(expectedRange.end);
    expect(page.querySelector('.bgt-records')?.textContent).toContain('Rent');
    expect(page.querySelector('.bgt-records')?.textContent).not.toContain('Travel');
  }));

  it('offers four date filters and shows a saved weekly period as a custom range', () => {
    const expectedRange = TestBed.inject(DateFilterService).getDateRange(component.datePipe, 'currentWeek');

    component.setInitialDateFilter({ ...profile, budgetPeriod: 'weekly' });
    fixture.detectChanges();

    const filterLabels = Array.from(page.querySelectorAll('.exp-filter-bar .exp-seg-btn'), button => button.textContent?.trim());
    expect(filterLabels).toEqual(['THIS_MONTH', 'LAST_MONTH', 'CURRENT_YEAR', 'CUSTOM']);
    expect(page.querySelector('.exp-filter-bar .exp-seg-btn[aria-pressed="true"]')?.textContent?.trim()).toBe('CUSTOM');
    expect(component.dateFilter$.value).toEqual(expectedRange);
  });

  it('opens a recorded budget for editing and saves the localized amount on the same record', async () => {
    page.querySelector<HTMLButtonElement>('.rm-trigger')!.click();
    fixture.detectChanges();
    page.querySelector<HTMLButtonElement>('.rm-item')!.click();
    fixture.detectChanges();

    const dialog = page.querySelector('[role="dialog"]')!;
    const amount = dialog.querySelector<HTMLInputElement>('#budget-amount')!;
    expect(dialog.querySelector('h2')?.textContent).toContain('EDIT_BUDGET');
    expect(amount.value).toBe('200');
    expect(dialog.querySelector('#budget-category-value')?.textContent).toContain('Groceries');

    amount.value = '၂၅၀';
    amount.dispatchEvent(new Event('input'));
    dialog.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve();

    expect(updateBudget).toHaveBeenCalledWith('groceries-limit', jasmine.objectContaining({ amount: 250, category: 'Groceries' }));
    expect(component.isAddModalOpen).toBeFalse();
  });

  it('explains an empty filter and focuses the amount when an incomplete form is submitted', () => {
    budgets.next([]);
    fixture.detectChanges();
    expect(page.querySelector('.bgt-empty-overview h2')?.textContent).toContain('BUDGET_EMPTY_PERIOD');

    page.querySelector<HTMLButtonElement>('.exp-filter-top-row .exp-add-toolbar-btn, .bgt-add-fab')!.click();
    fixture.detectChanges();
    page.querySelector<HTMLButtonElement>('.bgt-save')!.click();
    fixture.detectChanges();

    const input = page.querySelector<HTMLInputElement>('#budget-amount')!;
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(page.querySelector('#budget-amount-error')?.textContent).toContain('AMOUNT_REQUIRED');
    expect(document.activeElement).toBe(input);
  });
});
