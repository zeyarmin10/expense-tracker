import { Injectable, inject } from '@angular/core';
import { child, listVal, push, remove, update } from '@angular/fire/database';
import { Observable, firstValueFrom, from, of, combineLatest } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { AuthService } from './auth';
import { SpaceDataService } from './space-data.service';
import { getActiveGroupId, UserProfile } from './user-data';
import { PersonalOfflineDataService } from './personal-offline-data.service';
import { SharedOfflineDataService } from './shared-offline-data.service';
import { NetworkService } from './network.service';

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
  updatedAt?: string;
}

@Injectable({ providedIn: 'root' })
export class ShopExpenseService {
  private authService = inject(AuthService);
  private spaceDataService = inject(SpaceDataService);
  private personalOfflineData = inject(PersonalOfflineDataService);
  private sharedOfflineData = inject(SharedOfflineDataService);
  private network = inject(NetworkService);

  getShopExpenses(): Observable<ShopExpense[]> {
    return combineLatest([this.authService.userProfile$, this.network.isOnline$]).pipe(
      switchMap(([profile]) => {
        if (!profile?.uid) return of([] as ShopExpense[]);
        if (this.sharedOfflineData.isOfflineShared(profile)) {
          return from(this.sharedOfflineData.read<ShopExpense>(profile, 'shopExpenses')).pipe(
            map(records => this.sortRecords(Object.entries(records).map(([id, { id: _recordId, ...record }]) => ({ id, ...record })))),
          );
        }
        if (this.personalOfflineData.isOfflinePersonal(profile)) {
          return from(this.personalOfflineData.read<ShopExpense>(profile, 'shopExpenses')).pipe(
            map(records => this.sortRecords(Object.entries(records).map(([id, { id: _recordId, ...record }]) => ({ id, ...record })))),
          );
        }
        return from(this.spaceDataService.getActiveCollectionContext(profile, 'shopExpenses')).pipe(
          switchMap(({ canonicalRef, legacyRef }) => listVal<ShopExpense>(canonicalRef || legacyRef, { keyField: 'id' })),
          map(records => {
            const normalized = this.sortRecords(records);
            const cached = Object.fromEntries(normalized.map(({ id, ...record }) => [id, record]));
            if (getActiveGroupId(profile)) void this.sharedOfflineData.cacheRemote(profile, 'shopExpenses', cached);
            else void this.personalOfflineData.cacheRemote(profile, 'shopExpenses', cached);
            return normalized;
          }),
        );
      }),
    );
  }

  async addShopExpense(data: Omit<ShopExpense, 'id' | 'currency' | 'userId' | 'groupId' | 'createdByName' | 'createdAt'>): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$);
    if (!profile?.uid) throw new Error('User not authenticated.');
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
    if (this.sharedOfflineData.isOfflineShared(profile)) {
      await this.sharedOfflineData.write(profile, 'shopExpenses', 'set', this.sharedOfflineData.createRecordId('shopExpenses'), record);
      return;
    }
    if (this.personalOfflineData.isOfflinePersonal(profile)) {
      await this.personalOfflineData.write(profile, 'shopExpenses', 'set', this.personalOfflineData.createRecordId('shopExpenses'), record);
      return;
    }
    const { canonicalRef, legacyRef } = await this.spaceDataService.getActiveCollectionContext(profile, 'shopExpenses');
    await push(canonicalRef || legacyRef, record);
  }

  async deleteShopExpense(id: string): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$);
    if (!profile?.uid) throw new Error('User not authenticated.');
    if (this.sharedOfflineData.isOfflineShared(profile)) {
      const records = await this.sharedOfflineData.read<ShopExpense>(profile, 'shopExpenses');
      await this.sharedOfflineData.write(profile, 'shopExpenses', 'remove', id, undefined,
        records[id]?.updatedAt || records[id]?.createdAt || null);
      return;
    }
    if (this.personalOfflineData.isOfflinePersonal(profile)) {
      await this.personalOfflineData.write(profile, 'shopExpenses', 'remove', id);
      return;
    }
    const { canonicalRef, legacyRef } = await this.spaceDataService.getActiveCollectionContext(profile, 'shopExpenses');
    await remove(child(canonicalRef || legacyRef, id));
  }

  async updateShopExpense(
    id: string,
    data: Pick<ShopExpense, 'date' | 'category' | 'description' | 'amount'> & { receiptUrl?: string },
  ): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$);
    if (!profile?.uid) throw new Error('User not authenticated.');
    const { receiptUrl, ...expenseData } = data;
    const updateData = {
      ...expenseData,
      category: data.category.trim(),
      description: data.description?.trim() || '',
      amount: Number(data.amount),
      updatedAt: new Date().toISOString(),
      ...(receiptUrl ? { receiptUrl } : {}),
    };
    if (this.sharedOfflineData.isOfflineShared(profile)) {
      const records = await this.sharedOfflineData.read<ShopExpense>(profile, 'shopExpenses');
      await this.sharedOfflineData.write(profile, 'shopExpenses', 'update', id, updateData,
        records[id]?.updatedAt || records[id]?.createdAt || null);
      return;
    }
    if (this.personalOfflineData.isOfflinePersonal(profile)) {
      await this.personalOfflineData.write(profile, 'shopExpenses', 'update', id, updateData);
      return;
    }
    const { canonicalRef, legacyRef } = await this.spaceDataService.getActiveCollectionContext(profile, 'shopExpenses');
    await update(child(canonicalRef || legacyRef, id), updateData);
  }

  private sortRecords(records: ShopExpense[]): ShopExpense[] {
    return records
      .map(record => ({ ...record, amount: Number(record.amount) || 0 }))
      .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
  }
}
