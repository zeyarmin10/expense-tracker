import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Profit } from './profit';

describe('Profit', () => {
  let component: Profit;
  let fixture: ComponentFixture<Profit>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Profit]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Profit);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
