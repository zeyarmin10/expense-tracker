import { TestBed } from '@angular/core/testing';

import { DataManager } from './data-manager';

describe('DataManager', () => {
  let service: DataManager;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DataManager);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
