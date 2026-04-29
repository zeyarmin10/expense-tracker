import { TestBed } from '@angular/core/testing';

import { ProfitLossService } from './profit-loss.service';

describe('ProfitLossService', () => {
  let service: ProfitLossService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ProfitLossService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should calculate daily cash flow by date and currency', () => {
    const expenses = [
      { date: '2026-04-29', currency: 'MMK', totalCost: 4000 },
      { date: '2026-04-29', currency: 'MMK', totalCost: 1500 },
      { date: '2026-04-28', currency: 'USD', totalCost: 20 },
    ] as any;
    const incomes = [
      { date: '2026-04-29', currency: 'MMK', amount: 10000 },
      { date: '2026-04-28', currency: 'USD', amount: 50 },
      { date: '2026-04-28', currency: 'MMK', amount: 3000 },
    ] as any;

    expect(service.calculateDailyCashFlow(expenses, incomes)).toEqual([
      {
        date: '2026-04-29',
        currency: 'MMK',
        cashIn: 10000,
        cashOut: 5500,
        netCashFlow: 4500,
      },
      {
        date: '2026-04-28',
        currency: 'MMK',
        cashIn: 3000,
        cashOut: 0,
        netCashFlow: 3000,
      },
      {
        date: '2026-04-28',
        currency: 'USD',
        cashIn: 50,
        cashOut: 20,
        netCashFlow: 30,
      },
    ]);
  });
});
