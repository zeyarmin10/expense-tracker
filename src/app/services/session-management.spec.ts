import { TestBed } from '@angular/core/testing';

import { SessionManagement } from './session-management';

describe('SessionManagement', () => {
  let service: SessionManagement;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SessionManagement);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
