// import { Routes } from '@angular/router';
// import { Expense } from './components/expense/expense';
// import { Profit } from './components/profit/profit';
// import { Category } from './components/category/category';
// import { LoginComponent } from './components/login/login';
// import { authGuard } from './guards/auth.guard';
// import { publicGuard } from './guards/public.guard';

// export const routes: Routes = [
//   { path: '', redirectTo: '/login', pathMatch: 'full' }, // Default route redirects to login
//   { path: '**', redirectTo: '/login' }, // Wildcard route redirects to login
//   { path: 'login', component: LoginComponent, canActivate: [publicGuard] },
//   { path: 'expense', component: Expense, canActivate: [authGuard] },
//   { path: 'profit', component: Profit, canActivate: [authGuard] },
//   { path: 'category', component: Category, canActivate: [authGuard] }
// ];


// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login';
import { Expense } from './components/expense/expense';
import { authGuard } from './guards/auth.guard';
import { publicGuard } from './guards/public.guard';
import { Profit } from './components/profit/profit';
import { Category } from './components/category/category';

export const routes: Routes = [
  { path: 'login', component: LoginComponent, canActivate: [publicGuard] },
  { path: 'expense', component: Expense, canActivate: [authGuard] },
  { path: 'profit', component: Profit, canActivate: [authGuard] },
  { path: 'category', component: Category, canActivate: [authGuard] },
  { path: '', redirectTo: '/login', pathMatch: 'full' }, // Default route redirects to login
  { path: '**', redirectTo: '/login' }, // Wildcard route redirects to login
];
