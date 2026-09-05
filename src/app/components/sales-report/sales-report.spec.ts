import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TEST_PROVIDERS } from '../../testing/test-providers';

import { SalesReport } from './sales-report';

describe('SalesReport', () => {
  let component: SalesReport;
  let fixture: ComponentFixture<SalesReport>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SalesReport],
      providers: TEST_PROVIDERS
    })
    .compileComponents();

    fixture = TestBed.createComponent(SalesReport);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
