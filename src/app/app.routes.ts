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
  },
  { 
    path: 'expense/:date', 
    component: Expense,
    canActivate: [AuthGuard]
  },
  {
    path: 'expense',
    component: Expense,
    canActivate: [AuthGuard],
  },
  { 
    path: 'expense-overview', 
    component: ExpenseOverview ,
    canActivate: [AuthGuard]
  },
  { 
    path: 'budget', 
    component: BudgetComponent, 
    canActivate: [AuthGuard]
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
  },
  // Move the wildcard route to the very end of the array
  { path: '**', redirectTo: '/login' },
];
