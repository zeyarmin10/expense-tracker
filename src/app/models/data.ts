// src/app/models/data.ts

export interface DataICategory {
  id?: string; // Firebase will generate this, optional for new items
  name: string; // အမျိုးအစား
  userId: string; // To link to the user who created it
}

export interface DataIExpense {
  id?: string; // Firebase will generate this
  date: string; // ရက်စွဲ (e.g., 'YYYY-MM-DD' format)
  category: string; // အမျိုးအစား (name of the category)
  itemName: string; // ပစ္စည်းအမျိုးအမည်
  quantity: number; // အရေအတွက်
  unit: string; // ယူနစ်
  price: number; // ဈေးနှုန်း
  userId: string; // To link to the user who created it
}