export interface DataICategory {
  id?: string; 
  name: string; 
  userId: string; 
  device: string; 
  editedDevice?: string;
}

export interface DataIExpense {
  id?: string; 
  date: string; 
  category: string; 
  itemName: string; 
  quantity: number; 
  unit: string; 
  price: number; 
  currency: string;
  userId: string; 
  device: string; 
  editedDevice?: string;
  createdAt?: string;
  updatedAt?: string;
}