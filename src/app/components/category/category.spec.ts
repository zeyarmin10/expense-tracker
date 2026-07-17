import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TEST_PROVIDERS } from '../../testing/test-providers';

import { Category } from './category';

describe('Category', () => {
  let component: Category;
  let fixture: ComponentFixture<Category>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Category],
      providers: TEST_PROVIDERS
    })
    .compileComponents();

    fixture = TestBed.createComponent(Category);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
