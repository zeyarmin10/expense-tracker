export interface IExpense {
  id?: string; // Realtime Database key
  category: string;
  itemName: string;
  quantity: number;
  price: number;
  date: string;
  total?: number; // Optional as it's calculated
  userId?: string; // To link expenses to a user
  isEditing?: boolean; // Added for UI state management in the template
  originalExpense?: IExpense; // To store original data for cancel operation
}
