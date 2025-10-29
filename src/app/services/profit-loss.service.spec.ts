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
});
