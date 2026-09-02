import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TEST_PROVIDERS } from '../../testing/test-providers';

import { ShopDashboardComponent } from './shop-dashboard';

describe('ShopDashboardComponent', () => {
  let component: ShopDashboardComponent;
  let fixture: ComponentFixture<ShopDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShopDashboardComponent],
      providers: TEST_PROVIDERS
    })
    .compileComponents();

    fixture = TestBed.createComponent(ShopDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
