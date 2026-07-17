import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TEST_PROVIDERS } from '../../testing/test-providers';

import { Expense } from './expense';

describe('Expense', () => {
  let component: Expense;
  let fixture: ComponentFixture<Expense>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Expense],
      providers: TEST_PROVIDERS
    })
    .compileComponents();

    fixture = TestBed.createComponent(Expense);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
