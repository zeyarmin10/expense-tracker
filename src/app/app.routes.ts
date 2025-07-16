import { Routes } from '@angular/router';
import { Expense } from './components/expense/expense';
import { Profit } from './components/profit/profit';
import { Category } from './components/category/category';
// import { ExpenseList } from './components/expense-list/expense-list';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'profit',
    pathMatch: 'full',
  },
  {
    path: 'profit',
    component: Profit,
  },
  {
    path: 'expense',
    component: Expense,
  },
//   {
//     path: 'expense-list',
//     component: ExpenseList,
//   },
  {
    path: 'category',
    component: Category,
  },
];
