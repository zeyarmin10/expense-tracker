import { Routes } from '@angular/router';
import { Expense } from './components/expense/expense';
import { Profit } from './components/profit/profit';
import { Category } from './components/category/category';
import { LoginComponent } from './components/login/login';
import { DashboardComponent } from './components/dashboard/dashboard';
import { AuthGuard } from './guards/auth-guard'; // Import your auth guard
import { UserProfileComponent } from './components/user-profile/user-profile';
import { ExpenseOverview } from './components/expense-overview/expense-overview'
import { BudgetComponent } from './components/budget/budget';
import { UnauthorizedComponent } from './components/unauthorized/unauthorized';

export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' }, // Default route
  { path: 'login', component: LoginComponent },
  {
    path: 'dashboard',
    component: DashboardComponent,
    canActivate: [AuthGuard],
  },
  {
    path: 'profit',
    component: Profit,
    canActivate: [AuthGuard],
    data: { permissions: { canReadProfitData: true } },
  },
  {
    path: 'expense/:date',
    component: Expense,
    canActivate: [AuthGuard],
    data: { permissions: { canWriteExpense: true } },
  },
  {
    path: 'expense',
    component: Expense,
    canActivate: [AuthGuard],
    data: { permissions: { canWriteExpense: true } },
  },
  {
    path: 'expense-overview',
    component: ExpenseOverview,
    canActivate: [AuthGuard],
    data: { permissions: { canReadExpenseOverview: true } },
  },
  {
    path: 'budget',
    component: BudgetComponent,
    canActivate: [AuthGuard],
    data: { permissions: { canReadBudgetData: true } },
  },
  {
    path: 'profile',
    component: UserProfileComponent,
    canActivate: [AuthGuard],
  },
  {
    path: 'category',
    component: Category,
    canActivate: [AuthGuard],
    data: { permissions: { canReadWriteAllData: true } },
  },
  { 
    path: 'unauthorized', 
    component: UnauthorizedComponent, 
    canActivate: [AuthGuard] 
  },
  // Move the wildcard route to the very end of the array
  { path: '**', redirectTo: '/login' },
];
