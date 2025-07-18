import { Routes } from '@angular/router';
import { Expense } from './components/expense/expense';
import { Profit } from './components/profit/profit';
import { Category } from './components/category/category';
import { LoginComponent } from './components/login/login';
import { DashboardComponent } from './components/dashboard/dashboard';
import { AuthGuard } from './guards/auth-guard'; // Import your auth guard

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
    path: 'expense',
    component: Expense,
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
