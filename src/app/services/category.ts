import { Injectable, inject, forwardRef } from '@angular/core';
import {
  Database,
  ref,
  push,
  remove,
  update,
  listVal,
  query,
  orderByChild,
  equalTo,
  DatabaseReference,
  get,
  child,
} from '@angular/fire/database';
import { Observable, switchMap, firstValueFrom, map, of, Subject, take } from 'rxjs';
import { AuthService } from './auth';
import { TranslateService } from '@ngx-translate/core';
import { UserProfile } from './user-data'; // Import UserProfile

export interface ServiceICategory {
  id?: string; 
  name: string;
  userId?: string;
  groupId?: string;
  createdAt?: string;
}

interface ServiceIExpense {
  id?: string;
  categoryId: string; 
}

@Injectable({
  providedIn: 'root',
})
export class CategoryService {
  private db: Database = inject(Database);
  private translateService = inject(TranslateService);
  private authService = inject(forwardRef(() => AuthService));

  private categoryUpdatedSource = new Subject<{
    oldName: string;
    newName: string;
    userId: string;
  }>();
  categoryUpdated$ = this.categoryUpdatedSource.asObservable();

  constructor() {}

  private getCategoriesRef(userId: string): DatabaseReference {
    return ref(this.db, `users/${userId}/categories`);
  }

  private getGroupCategoriesRef(groupId: string): DatabaseReference {
    return ref(this.db, `group_data/${groupId}/categories`);
  }

  private getExpensesRef(userId: string): DatabaseReference {
    return ref(this.db, `users/${userId}/expenses`);
  }

  private getGroupExpensesRef(groupId: string): DatabaseReference {
    return ref(this.db, `group_data/${groupId}/expenses`);
  }

  getCategories(): Observable<ServiceICategory[]> {
    return this.authService.userProfile$.pipe(
      switchMap((profile: UserProfile | null) => { // Explicitly type the profile
        if (profile?.groupId) {
          return listVal<ServiceICategory>(this.getGroupCategoriesRef(profile.groupId), { keyField: 'id' });
        } else if (profile?.uid) {
          return listVal<ServiceICategory>(this.getCategoriesRef(profile.uid), { keyField: 'id' });
        } else {
          return of([]);
        }
      })
    );
  }

  async setupPersonalAccountCategories(): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$.pipe(take(1))) as UserProfile | null;
    if (!profile || profile.groupId) {
      return;
    }

    const categoriesRef = this.getCategoriesRef(profile.uid);
    const snapshot = await get(categoriesRef);

    if (!snapshot.exists()) {
        const currentLang = this.translateService.currentLang || 'my';
        await this.addDefaultCategories(profile.uid, currentLang);
    }
  }

  async addCategory(categoryName: string): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$) as UserProfile | null;
    if (!profile?.uid) {
      throw new Error('User not authenticated.');
    }

    const newCategory: Omit<ServiceICategory, 'id'> = {
      name: categoryName.trim(),
      createdAt: new Date().toISOString(),
    };

    let categoriesRef: DatabaseReference;
    if (profile.groupId) {
      newCategory.groupId = profile.groupId;
      newCategory.userId = profile.uid;
      categoriesRef = this.getGroupCategoriesRef(profile.groupId);
    } else {
      newCategory.userId = profile.uid;
      categoriesRef = this.getCategoriesRef(profile.uid);
    }

    await push(categoriesRef, newCategory);
  }

  async updateCategory(categoryId: string, oldCategoryName: string, newCategoryName: string): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$) as UserProfile | null;
    if (!profile?.uid) {
      throw new Error('User not authenticated.');
    }
    if (!categoryId) {
      throw new Error('Category ID is required for update.');
    }

    let categoryRef: DatabaseReference;
    if (profile.groupId) {
      categoryRef = ref(this.db, `group_data/${profile.groupId}/categories/${categoryId}`);
    } else {
      categoryRef = ref(this.db, `users/${profile.uid}/categories/${categoryId}`);
    }

    await update(categoryRef, { name: newCategoryName.trim() });

    this.categoryUpdatedSource.next({
      oldName: oldCategoryName,
      newName: newCategoryName,
      userId: profile.uid,
    });
  }

  async deleteCategory(categoryId: string): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$) as UserProfile | null;
    if (!profile?.uid) {
      throw new Error('User not authenticated.');
    }
    if (!categoryId) {
      throw new Error('Category ID is required for deletion.');
    }

    let categoryRef: DatabaseReference;
    if (profile.groupId) {
      categoryRef = ref(this.db, `group_data/${profile.groupId}/categories/${categoryId}`);
    } else {
      categoryRef = ref(this.db, `users/${profile.uid}/categories/${categoryId}`);
    }

    await remove(categoryRef);
  }

  async isCategoryUsedInExpenses(categoryId: string): Promise<boolean> {
    const profile = await firstValueFrom(this.authService.userProfile$) as UserProfile | null;
    if (!profile?.uid) {
      throw new Error('User not authenticated.');
    }

    let categoryRef: DatabaseReference;
    let expensesRef: DatabaseReference;

    if (profile.groupId) {
      categoryRef = ref(this.db, `group_data/${profile.groupId}/categories/${categoryId}`);
      expensesRef = this.getGroupExpensesRef(profile.groupId);
    } else {
      categoryRef = ref(this.db, `users/${profile.uid}/categories/${categoryId}`);
      expensesRef = this.getExpensesRef(profile.uid);
    }

    const categorySnapshot = await get(categoryRef);
    const categoryName = categorySnapshot.val()?.name;

    if (!categoryName) {
      return false; 
    }

    const expensesQuery = query(expensesRef, orderByChild('category'), equalTo(categoryName));
    const snapshot = await get(expensesQuery);
    return snapshot.exists();
  }

  private async checkAndAddDefaultCategories(userId: string): Promise<void> {
    const categories$ = this.getCategories();
    const existingCategories = await firstValueFrom(categories$.pipe(take(1)));

    if (existingCategories.length === 0) {
      const currentLang = this.translateService.currentLang || 'my';
      await this.addDefaultCategories(userId, currentLang);
    }
  }

  async addDefaultCategories(userId: string, language: string): Promise<void> {
    const defaultCategories = [
      { en: 'Food', my: 'အစားအသောက်' },
      { en: 'Transportation', my: 'သယ်ယူပို့ဆောင်ရေး' },
      { en: 'Utilities', my: 'အသုံးစရိတ်' },
      { en: 'Entertainment', my: 'ဖျော်ဖြေရေး' },
      { en: 'Shopping', my: 'စျေးဝယ်' },
    ];

    for (const categoryData of defaultCategories) {
      const categoryName =
        language === 'my' ? categoryData.my : categoryData.en;
      const newCategory: Omit<ServiceICategory, 'id'> = {
        name: categoryName.trim(),
        userId: userId,
        createdAt: new Date().toISOString(),
      };
      await push(this.getCategoriesRef(userId), newCategory);
    }
  }

  async addDefaultGroupCategories(groupId: string, language: string): Promise<void> {
    const defaultCategories = [
      { en: 'Food', my: 'အစားအသောက်' },
      { en: 'Transportation', my: 'သယ်ယူပို့ဆောင်ရေး' },
      { en: 'Utilities', my: 'အသုံးစရိတ်' },
      { en: 'Entertainment', my: 'ဖျော်ဖြေရေး' },
      { en: 'Shopping', my: 'စျေးဝယ်' },
    ];

    const groupCategoriesRef = this.getGroupCategoriesRef(groupId);
    for (const categoryData of defaultCategories) {
      const categoryName =
        language === 'my' ? categoryData.my : categoryData.en;
      const newCategory: Omit<ServiceICategory, 'id'> = {
        name: categoryName.trim(),
        groupId: groupId,
        createdAt: new Date().toISOString(),
      };
      await push(groupCategoriesRef, newCategory);
    }
  }
}
