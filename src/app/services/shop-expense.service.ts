import { Injectable, inject } from '@angular/core';
import { child, listVal, push, remove, update } from '@angular/fire/database';
import { Observable, firstValueFrom, from, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { AuthService } from './auth';
import { SpaceDataService } from './space-data.service';
import { getActiveGroupId, UserProfile } from './user-data';

export interface ShopExpense {
  id: string;
  date: string;
  category: string;
  description?: string;
  amount: number;
  currency: string;
  receiptUrl?: string;
  userId?: string;
  groupId?: string;
  createdByName?: string;
  createdAt?: string;
}

@Injectable({ providedIn: 'root' })
export class ShopExpenseService {
  private authService = inject(AuthService);
  private spaceDataService = inject(SpaceDataService);

  getShopExpenses(): Observable<ShopExpense[]> {
    return this.authService.userProfile$.pipe(
      switchMap(profile => {
        if (!profile?.uid) return of([] as ShopExpense[]);
        return from(this.spaceDataService.getActiveCollectionContext(profile, 'shopExpenses')).pipe(
          switchMap(({ canonicalRef, legacyRef }) => listVal<ShopExpense>(canonicalRef || legacyRef, { keyField: 'id' })),
          map(records => records
            .map(record => ({ ...record, amount: Number(record.amount) || 0 }))
            .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''))),
        );
      }),
    );
  }

  async addShopExpense(data: Omit<ShopExpense, 'id' | 'currency' | 'userId' | 'groupId' | 'createdByName' | 'createdAt'>): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$);
    if (!profile?.uid) throw new Error('User not authenticated.');
    const { canonicalRef, legacyRef } = await this.spaceDataService.getActiveCollectionContext(profile, 'shopExpenses');
    // Realtime Database rejects properties with `undefined` values. Receipt
    // upload is optional, so keep its key out of the record entirely until a
    // real URL exists instead of spreading `receiptUrl: undefined` into it.
    const { receiptUrl, ...expenseData } = data;
    const record = {
      ...expenseData,
      category: data.category.trim(),
      description: data.description?.trim() || '',
      amount: Number(data.amount),
      currency: profile.currency || 'MMK',
      userId: profile.uid,
      createdByName: profile.displayName || 'Anonymous',
      createdAt: new Date().toISOString(),
      ...(receiptUrl ? { receiptUrl } : {}),
      ...(getActiveGroupId(profile) ? { groupId: getActiveGroupId(profile) } : {}),
    };
    await push(canonicalRef || legacyRef, record);
  }

  async deleteShopExpense(id: string): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$);
    if (!profile?.uid) throw new Error('User not authenticated.');
    const { canonicalRef, legacyRef } = await this.spaceDataService.getActiveCollectionContext(profile, 'shopExpenses');
    await remove(child(canonicalRef || legacyRef, id));
  }

  async updateShopExpense(
    id: string,
    data: Pick<ShopExpense, 'date' | 'category' | 'description' | 'amount'> & { receiptUrl?: string },
  ): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$);
    if (!profile?.uid) throw new Error('User not authenticated.');
    const { canonicalRef, legacyRef } = await this.spaceDataService.getActiveCollectionContext(profile, 'shopExpenses');
    const { receiptUrl, ...expenseData } = data;
    await update(child(canonicalRef || legacyRef, id), {
      ...expenseData,
      category: data.category.trim(),
      description: data.description?.trim() || '',
      amount: Number(data.amount),
      updatedAt: new Date().toISOString(),
      ...(receiptUrl ? { receiptUrl } : {}),
    });
  }
}
