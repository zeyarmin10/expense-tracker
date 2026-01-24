import { Injectable, inject } from '@angular/core';
import {
  Database,
  ref,
  push,
  set,
  update,
  remove,
  listVal,
} from '@angular/fire/database';
import { Observable, switchMap, firstValueFrom } from 'rxjs';
import { AuthService } from './auth';
import { DataICategory, DataIExpense } from '../core/models/data'; // Import interfaces

@Injectable({
  providedIn: 'root',
})
export class DataManagerService {
  private db: Database = inject(Database);
  private authService: AuthService = inject(AuthService);

  // Helper to get the user-specific path in RTDB
  private getUserDataPath(
    dataType: 'categories' | 'expenses'
  ): Observable<string | null> {
    return this.authService.currentUser$.pipe(
      switchMap((user) => {
        if (user && user.uid) {
          return new Observable<string>((observer) => {
            observer.next(`users/${user.uid}/${dataType}`);
            observer.complete();
          });
        }
        return new Observable<null>((observer) => {
          observer.next(null);
          observer.complete();
        });
      })
    );
  }

  // --- Category Management ---

  async addCategory(categoryName: string): Promise<void> {
    const userPathObservable = this.getUserDataPath('categories');
    const path = await firstValueFrom(userPathObservable);
    if (!path) throw new Error('User not authenticated or path not found.');

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
    return this.getUserDataPath('categories').pipe(
      switchMap((path) => {
        if (!path)
          return new Observable<DataICategory[]>((observer) => {
            observer.next([]);
            observer.complete();
          });
        return listVal<DataICategory>(ref(this.db, path), { keyField: 'id' });
      })
    );
  }

  async editCategory(categoryId: string, newName: string): Promise<void> {
    const userPathObservable = this.getUserDataPath('categories');
    const path = await firstValueFrom(userPathObservable);
    if (!path) throw new Error('User not authenticated or path not found.');

    const categoryRef = ref(this.db, `${path}/${categoryId}`);
    return update(categoryRef, { name: newName, editedDevice: navigator.userAgent });
  }

  async deleteCategory(categoryId: string): Promise<void> {
    const userPathObservable = this.getUserDataPath('categories');
    const path = await firstValueFrom(userPathObservable);
    if (!path) throw new Error('User not authenticated or path not found.');

    const categoryRef = ref(this.db, `${path}/${categoryId}`);
    return remove(categoryRef);
  }

  // --- Expense Management ---

  async addExpense(
    expense: Omit<DataIExpense, 'id' | 'userId'>
  ): Promise<void> {
    const userPathObservable = this.getUserDataPath('expenses');
    const path = await firstValueFrom(userPathObservable);
    if (!path) throw new Error('User not authenticated or path not found.');

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
    return this.getUserDataPath('expenses').pipe(
      switchMap((path) => {
        if (!path)
          return new Observable<DataIExpense[]>((observer) => {
            observer.next([]);
            observer.complete();
          });
        return listVal<DataIExpense>(ref(this.db, path), { keyField: 'id' });
      })
    );
  }

  async editExpense(expense: DataIExpense): Promise<void> {
    const userPathObservable = this.getUserDataPath('expenses');
    const path = await firstValueFrom(userPathObservable);
    if (!path) throw new Error('User not authenticated or path not found.');

    const expenseRef = ref(this.db, `${path}/${expense.id}`);
    return update(expenseRef, { ...expense, id: undefined, editedDevice: navigator.userAgent });
  }

  async deleteExpense(expenseId: string): Promise<void> {
    const userPathObservable = this.getUserDataPath('expenses');
    const path = await firstValueFrom(userPathObservable);
    if (!path) throw new Error('User not authenticated or path not found.');

    const expenseRef = ref(this.db, `${path}/${expenseId}`);
    return remove(expenseRef);
  }
}
