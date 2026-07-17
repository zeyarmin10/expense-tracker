import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TEST_PROVIDERS } from '../../testing/test-providers';

import { ExpenseOverview } from './expense-overview';

describe('ExpenseOverview', () => {
  let component: ExpenseOverview;
  let fixture: ComponentFixture<ExpenseOverview>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExpenseOverview],
      providers: TEST_PROVIDERS
    })
    .compileComponents();

    fixture = TestBed.createComponent(ExpenseOverview);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
