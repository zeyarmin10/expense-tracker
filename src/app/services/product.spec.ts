import { TestBed } from '@angular/core/testing';

import { TEST_PROVIDERS } from '../testing/test-providers';

import { ProductService } from './product';

describe('ProductService', () => {
  let service: ProductService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: TEST_PROVIDERS });
    service = TestBed.inject(ProductService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
