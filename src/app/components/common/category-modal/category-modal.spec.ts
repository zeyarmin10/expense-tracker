import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TEST_PROVIDERS } from '../../../testing/test-providers';

import { CategoryModalComponent } from './category-modal';

describe('CategoryModalComponent', () => {
  let component: CategoryModalComponent;
  let fixture: ComponentFixture<CategoryModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CategoryModalComponent],
      providers: TEST_PROVIDERS
    })
    .compileComponents();

    fixture = TestBed.createComponent(CategoryModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
