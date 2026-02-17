import { Injectable, inject } from '@angular/core';
import {
  Database,
  ref,
  push,
  set,
  update,
  remove,
  listVal,
  get,
} from '@angular/fire/database';
import { Observable, switchMap, firstValueFrom, of } from 'rxjs';
import { AuthService } from './auth';
import { DataICategory, DataIExpense } from '../core/models/data';
import { UserDataService } from './user-data';

@Injectable({
  providedIn: 'root',
})
export class DataManagerService {
  private db: Database = inject(Database);
  private authService: AuthService = inject(AuthService);
  private userDataService: UserDataService = inject(UserDataService);

  // --- Account Type Setup ---

  async setupPersonalAccount(userId: string): Promise<void> {
    return this.userDataService.updateUserProfile(userId, { accountType: 'personal' });
  }

  // --- Group Management ---

  private generateInviteCode(): string {
    return `GR-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  }

  async createGroup(groupName: string, userId: string): Promise<void> {
    const newInviteCode = this.generateInviteCode();
    const groupRef = push(ref(this.db, 'groups'));
    const groupId = groupRef.key!;

    const updates: { [key: string]: any } = {};
    updates[`/groups/${groupId}`] = { groupName, ownerId: userId, inviteCode: newInviteCode };
    updates[`/invite_codes/${newInviteCode}`] = groupId;
    // Set the creator's role to 'admin'
    updates[`/group_members/${groupId}/${userId}`] = 'admin'; 
    updates[`/users/${userId}/groupId`] = groupId;
    updates[`/users/${userId}/accountType`] = 'group';

    return update(ref(this.db), updates);
  }

  async joinGroup(inviteCode: string, userId: string): Promise<boolean> {
    const codeRef = ref(this.db, `invite_codes/${inviteCode}`);
    const snapshot = await get(codeRef);

    if (snapshot.exists()) {
      const groupId = snapshot.val();
      const updates: { [key: string]: any } = {};
      // Set the joining member's role to 'member'
      updates[`/group_members/${groupId}/${userId}`] = 'member'; 
      updates[`/users/${userId}/groupId`] = groupId;
      updates[`/users/${userId}/accountType`] = 'group';
      await update(ref(this.db), updates);
      return true;
    }
    return false;
  }

  // --- Unified Data Access ---

  private getDataPath(
    dataType: 'categories' | 'expenses'
  ): Observable<string | null> {
    return this.authService.currentUser$.pipe(
      switchMap(user => {
        if (!user) return of(null);
        return this.userDataService.getUserProfile(user.uid).pipe(
          switchMap(userProfile => {
            if (userProfile?.accountType === 'group' && userProfile.groupId) {
              return of(`group_data/${userProfile.groupId}/${dataType}`);
            } else if (userProfile?.accountType === 'personal') {
              return of(`users/${user.uid}/${dataType}`);
            }
            return of(null);
          })
        );
      })
    );
  }


  // --- Category Management ---

  async addCategory(categoryName: string): Promise<void> {
    const path = await firstValueFrom(this.getDataPath('categories'));
    if (!path) throw new Error('Data path not found. User may not be fully set up.');

    const categoryRef = push(ref(this.db, path));
    const newCategory: DataICategory = {
      id: categoryRef.key!,
      name: categoryName,
      userId: (await firstValueFrom(this.authService.currentUser$))!.uid,
      device: navigator.userAgent,
    };

    return set(categoryRef, newCategory);
  }

  getCategories(): Observable<DataICategory[]> {
    return this.getDataPath('categories').pipe(
      switchMap((path) => {
        if (!path) return of([]);
        return listVal<DataICategory>(ref(this.db, path), { keyField: 'id' });
      })
    );
  }

  async editCategory(categoryId: string, newName: string): Promise<void> {
    const path = await firstValueFrom(this.getDataPath('categories'));
    if (!path) throw new Error('Data path not found. User may not be fully set up.');

    const categoryRef = ref(this.db, `${path}/${categoryId}`);
    return update(categoryRef, { name: newName, editedDevice: navigator.userAgent });
  }

  async deleteCategory(categoryId: string): Promise<void> {
    const path = await firstValueFrom(this.getDataPath('categories'));
    if (!path) throw new Error('Data path not found. User may not be fully set up.');

    const categoryRef = ref(this.db, `${path}/${categoryId}`);
    return remove(categoryRef);
  }

  // --- Expense Management ---

  async addExpense(
    expense: Omit<DataIExpense, 'id' | 'userId'>
  ): Promise<void> {
    const path = await firstValueFrom(this.getDataPath('expenses'));
    if (!path) throw new Error('Data path not found. User may not be fully set up.');

    const expenseRef = push(ref(this.db, path));
    const newExpense: DataIExpense = {
      id: expenseRef.key!,
      userId: (await firstValueFrom(this.authService.currentUser$))!.uid,
      ...expense,
      device: navigator.userAgent,
    };
    return set(expenseRef, newExpense);
  }

  getExpenses(): Observable<DataIExpense[]> {
    return this.getDataPath('expenses').pipe(
      switchMap((path) => {
        if (!path) return of([]);
        return listVal<DataIExpense>(ref(this.db, path), { keyField: 'id' });
      })
    );
  }

  async editExpense(expense: DataIExpense): Promise<void> {
    const path = await firstValueFrom(this.getDataPath('expenses'));
    if (!path) throw new Error('Data path not found. User may not be fully set up.');

    const expenseRef = ref(this.db, `${path}/${expense.id}`);
    return update(expenseRef, { ...expense, id: undefined, editedDevice: navigator.userAgent });
  }

  async deleteExpense(expenseId: string): Promise<void> {
    const path = await firstValueFrom(this.getDataPath('expenses'));
    if (!path) throw new Error('Data path not found. User may not be fully set up.');

    const expenseRef = ref(this.db, `${path}/${expenseId}`);
    return remove(expenseRef);
  }
}
