import { inject, Injectable } from '@angular/core';
import { Database, list, push, ref, remove, set, ThenableReference } from '@angular/fire/database';
import { listVal } from 'rxfire/database';
import { Observable } from 'rxjs';

export interface CustomBudgetPeriod {
  id?: string;
  name: string;
  startDate: string;
  endDate: string;
  createdAt?: string;
}

@Injectable({
  providedIn: 'root'
})
export class CustomBudgetPeriodService {
  private db = inject(Database);

  getCustomBudgetPeriods(userId: string): Observable<CustomBudgetPeriod[]> {
    const periodsRef = ref(this.db, `users/${userId}/profile/customBudgetPeriods`);
    return listVal<CustomBudgetPeriod>(periodsRef, { keyField: 'id' });
  }

  addCustomBudgetPeriod(userId: string, period: Omit<CustomBudgetPeriod, 'id'>): ThenableReference {
    const listRef = ref(this.db, `users/${userId}/profile/customBudgetPeriods`);
    const newPeriodRef = push(listRef);
    const newPeriodData = {
      ...period,
      createdAt: new Date().toISOString()
    };
    set(newPeriodRef, newPeriodData);
    return newPeriodRef;
  }

  deleteCustomBudgetPeriod(userId: string, periodId: string): Promise<void> {
    const periodRef = ref(this.db, `users/${userId}/profile/customBudgetPeriods/${periodId}`);
    return remove(periodRef);
  }
}
