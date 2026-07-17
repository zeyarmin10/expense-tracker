import { TestBed } from '@angular/core/testing';

import { TEST_PROVIDERS } from '../testing/test-providers';

import { DataManagerService } from './data-manager';

describe('DataManagerService', () => {
  let service: DataManagerService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: TEST_PROVIDERS });
    service = TestBed.inject(DataManagerService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
