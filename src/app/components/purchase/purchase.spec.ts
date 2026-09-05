import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TEST_PROVIDERS } from '../../testing/test-providers';

import { Purchase } from './purchase';

describe('Purchase', () => {
  let component: Purchase;
  let fixture: ComponentFixture<Purchase>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Purchase],
      providers: TEST_PROVIDERS
    })
    .compileComponents();

    fixture = TestBed.createComponent(Purchase);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
