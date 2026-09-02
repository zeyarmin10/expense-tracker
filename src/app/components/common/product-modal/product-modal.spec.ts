import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TEST_PROVIDERS } from '../../../testing/test-providers';

import { ProductModalComponent } from './product-modal';

describe('ProductModalComponent', () => {
  let component: ProductModalComponent;
  let fixture: ComponentFixture<ProductModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductModalComponent],
      providers: TEST_PROVIDERS
    })
    .compileComponents();

    fixture = TestBed.createComponent(ProductModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
