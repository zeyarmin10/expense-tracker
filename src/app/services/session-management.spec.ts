import { TestBed } from '@angular/core/testing';

import { TEST_PROVIDERS } from '../testing/test-providers';

import { SessionManagementService } from './session-management';

describe('SessionManagementService', () => {
  let service: SessionManagementService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: TEST_PROVIDERS });
    service = TestBed.inject(SessionManagementService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
