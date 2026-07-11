import { Routes } from '@angular/router';
import { AuthGuard } from './guards/auth-guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./components/login/login').then((m) => m.LoginComponent),
    data: { titleKey: 'LOGIN_TITLE' },
  },
  {
    path: 'privacy-policy',
    loadComponent: () => import('./components/privacy-policy/privacy-policy').then((m) => m.PrivacyPolicyComponent),
    data: { titleKey: 'PRIVACY_POLICY_TITLE' },
  },
  {
    path: '',
    canActivate: [AuthGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () => import('./components/dashboard/dashboard').then((m) => m.DashboardComponent),
        data: { titleKey: 'DASHBOARD_WELCOME' },
      },
      {
        path: 'profit',
        loadComponent: () => import('./components/profit/profit').then((m) => m.Profit),
        data: { titleKey: 'PROFIT_LOSS_TITLE' },
      },
      {
        path: 'expense/:date',
        loadComponent: () => import('./components/expense/expense').then((m) => m.Expense),
        data: { titleKey: 'EXPENSE_ADD_TITLE' },
      },
      {
        path: 'expense',
        loadComponent: () => import('./components/expense/expense').then((m) => m.Expense),
        data: { titleKey: 'EXPENSE_ADD_TITLE' },
      },
      {
        path: 'expense-overview',
        loadComponent: () => import('./components/expense-overview/expense-overview').then((m) => m.ExpenseOverview),
        data: { titleKey: 'EXPENSE_OVERVIEW_TITLE' },
      },
      {
        path: 'budget',
        loadComponent: () => import('./components/budget/budget').then((m) => m.BudgetComponent),
        data: { titleKey: 'BUDGET_TITLE' },
      },
      {
        path: 'profile',
        loadComponent: () => import('./components/user-profile/user-profile').then((m) => m.UserProfileComponent),
        data: { titleKey: 'USER_PROFILE_TITLE' },
      },
      {
        path: 'category',
        loadComponent: () => import('./components/category/category').then((m) => m.Category),
        data: { titleKey: 'CREATE_CATEGORY_TITLE' },
      },
      {
        path: 'onboarding',
        loadComponent: () => import('./components/onboarding/onboarding').then((m) => m.OnboardingComponent),
        data: { titleKey: 'SPACE_SECTION_TITLE' },
      },
      {
        path: 'member-management',
        loadComponent: () => import('./components/member-management/member-management').then((m) => m.MemberManagementComponent),
        data: { titleKey: 'MEMBER_MANAGEMENT_TITLE' },
      },
      {
        path: 'notification-admin',
        loadComponent: () => import('./components/notification-admin/notification-admin').then((m) => m.NotificationAdminComponent),
        data: { titleKey: 'NOTI_ADMIN_TITLE' },
      },
    ]
  },
  { path: '**', redirectTo: '/dashboard' },
];
