import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExpenseOverview } from './expense-overview';

describe('ExpenseOverview', () => {
  let component: ExpenseOverview;
  let fixture: ComponentFixture<ExpenseOverview>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExpenseOverview]
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
