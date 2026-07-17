import { TestBed } from '@angular/core/testing';

import { SessionManagementService } from './session-management';

describe('SessionManagementService', () => {
  let service: SessionManagementService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SessionManagementService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
