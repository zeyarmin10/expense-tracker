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
import { MemberManagementComponent } from './components/member-management/member-management';
import { PrivacyPolicyComponent } from './components/privacy-policy/privacy-policy';
import { NotificationAdminComponent } from './components/notification-admin/notification-admin';

export const routes: Routes = [
  { path: 'login', component: LoginComponent, data: { titleKey: 'LOGIN_TITLE' } },
  { path: 'privacy-policy', component: PrivacyPolicyComponent, data: { titleKey: 'PRIVACY_POLICY_TITLE' } },
  {
    path: '',
    canActivate: [AuthGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: DashboardComponent, data: { titleKey: 'DASHBOARD_WELCOME' } },
      { path: 'profit', component: Profit, data: { titleKey: 'PROFIT_LOSS_TITLE' } },
      { path: 'expense/:date', component: Expense, data: { titleKey: 'EXPENSE_ADD_TITLE' } },
      { path: 'expense', component: Expense, data: { titleKey: 'EXPENSE_ADD_TITLE' } },
      { path: 'expense-overview', component: ExpenseOverview, data: { titleKey: 'EXPENSE_OVERVIEW_TITLE' } },
      { path: 'budget', component: BudgetComponent, data: { titleKey: 'BUDGET_TITLE' } },
      { path: 'profile', component: UserProfileComponent, data: { titleKey: 'USER_PROFILE_TITLE' } },
      { path: 'category', component: Category, data: { titleKey: 'CREATE_CATEGORY_TITLE' } },
      { path: 'onboarding', component: OnboardingComponent, data: { titleKey: 'SPACE_SECTION_TITLE' } },
      { path: 'member-management', component: MemberManagementComponent, data: { titleKey: 'MEMBER_MANAGEMENT_TITLE' } },
      { path: 'notification-admin', component: NotificationAdminComponent, data: { titleKey: 'NOTI_ADMIN_TITLE' } },
    ]
  },
  { path: '**', redirectTo: '/dashboard' },
];
