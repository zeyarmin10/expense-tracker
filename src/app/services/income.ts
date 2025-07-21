import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ServiceIIncome {
  id: string;
  date: string;
  amount: number;
  currency: string;
  description?: string;
}

@Injectable({
  providedIn: 'root',
})
export class IncomeService {
  private incomesSubject = new BehaviorSubject<ServiceIIncome[]>([]);
  incomes$: Observable<ServiceIIncome[]> = this.incomesSubject.asObservable();

  constructor() {
    this.loadIncomes();
  }

  private loadIncomes(): void {
    const storedIncomes = localStorage.getItem('incomes');
    if (storedIncomes) {
      this.incomesSubject.next(JSON.parse(storedIncomes));
    }
  }

  private saveIncomes(incomes: ServiceIIncome[]): void {
    localStorage.setItem('incomes', JSON.stringify(incomes));
    this.incomesSubject.next(incomes);
  }

  getIncomes(): Observable<ServiceIIncome[]> {
    return this.incomes$;
  }

  addIncome(income: ServiceIIncome): void {
    const currentIncomes = this.incomesSubject.value;
    this.saveIncomes([...currentIncomes, income]);
  }

  updateIncome(updatedIncome: ServiceIIncome): void {
    const currentIncomes = this.incomesSubject.value.map((income) =>
      income.id === updatedIncome.id ? updatedIncome : income
    );
    this.saveIncomes(currentIncomes);
  }

  deleteIncome(id: string): void {
    const currentIncomes = this.incomesSubject.value.filter(
      (income) => income.id !== id
    );
    this.saveIncomes(currentIncomes);
  }

  // Method to get incomes for a specific year (useful for dashboard)
  getIncomesByYear(year: number): Observable<ServiceIIncome[]> {
    return this.incomes$.pipe(
      map((incomes) =>
        incomes.filter((income) => new Date(income.date).getFullYear() === year)
      )
    );
  }
}
