import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TEST_PROVIDERS } from '../../testing/test-providers';

import { Inventory } from './inventory';

describe('Inventory', () => {
  let component: Inventory;
  let fixture: ComponentFixture<Inventory>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Inventory],
      providers: TEST_PROVIDERS
    })
    .compileComponents();

    fixture = TestBed.createComponent(Inventory);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
