import { inject, Injectable } from '@angular/core';
import { Database, push, ref, remove, set, ThenableReference } from '@angular/fire/database';
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

  private isRealSpaceId(spaceId: string | null | undefined): boolean {
    return !!spaceId && !spaceId.startsWith('personal:');
  }

  private getBasePath(userId: string, spaceId?: string | null): string {
    return this.isRealSpaceId(spaceId)
      ? `space_data/${spaceId}/customBudgetPeriods`
      : `users/${userId}/profile/customBudgetPeriods`;
  }

  getCustomBudgetPeriods(userId: string, spaceId?: string | null): Observable<CustomBudgetPeriod[]> {
    const periodsRef = ref(this.db, this.getBasePath(userId, spaceId));
    return listVal<CustomBudgetPeriod>(periodsRef, { keyField: 'id' });
  }

  addCustomBudgetPeriod(userId: string, period: Omit<CustomBudgetPeriod, 'id'>, spaceId?: string | null): ThenableReference {
    const listRef = ref(this.db, this.getBasePath(userId, spaceId));
    const newPeriodRef = push(listRef);
    set(newPeriodRef, { ...period, createdAt: new Date().toISOString() });
    return newPeriodRef;
  }

  deleteCustomBudgetPeriod(userId: string, periodId: string, spaceId?: string | null): Promise<void> {
    const periodRef = ref(this.db, `${this.getBasePath(userId, spaceId)}/${periodId}`);
    return remove(periodRef);
  }
}
