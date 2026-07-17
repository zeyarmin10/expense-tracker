import { TestBed } from '@angular/core/testing';

import { TEST_PROVIDERS } from '../testing/test-providers';

import { IncomeService } from './income';

describe('IncomeService', () => {
  let service: IncomeService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: TEST_PROVIDERS });
    service = TestBed.inject(IncomeService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
