import { Routes } from '@angular/router';
import { Expense } from './components/expense/expense';
import { Profit } from './components/profit/profit';
import { Category } from './components/category/category';
import { LoginComponent } from './components/login/login';
import { DashboardComponent } from './components/dashboard/dashboard';
import { AuthGuard } from './guards/auth-guard';
import { UserProfileComponent } from './components/user-profile/user-profile';
import { ExpenseOverview } from './components/expense-overview/expense-overview';
import { BudgetComponent } from './components/budget/budget';
import { OnboardingComponent } from './components/onboarding/onboarding';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  {
    path: '', 
    canActivate: [AuthGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: DashboardComponent },
      { path: 'profit', component: Profit },
      { path: 'expense/:date', component: Expense },
      { path: 'expense', component: Expense },
      { path: 'expense-overview', component: ExpenseOverview },
      { path: 'budget', component: BudgetComponent },
      { path: 'profile', component: UserProfileComponent },
      { path: 'category', component: Category },
      { path: 'onboarding', component: OnboardingComponent },
    ]
  },
  { path: '**', redirectTo: '/dashboard' },
];
