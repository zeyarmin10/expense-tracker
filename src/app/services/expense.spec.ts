import { TestBed } from '@angular/core/testing';

import { TEST_PROVIDERS } from '../testing/test-providers';

import { ExpenseService } from './expense';

describe('ExpenseService', () => {
  let service: ExpenseService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: TEST_PROVIDERS });
    service = TestBed.inject(ExpenseService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
