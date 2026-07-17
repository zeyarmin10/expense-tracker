import { TestBed } from '@angular/core/testing';

import { TEST_PROVIDERS } from '../testing/test-providers';

import { UserDataService } from './user-data';

describe('UserDataService', () => {
  let service: UserDataService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: TEST_PROVIDERS });
    service = TestBed.inject(UserDataService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
