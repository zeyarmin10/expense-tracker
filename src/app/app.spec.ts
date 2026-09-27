import { provideZoneChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { TEST_PROVIDERS } from './testing/test-providers';

import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideZoneChangeDetection(), ...TEST_PROVIDERS]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should expose the app title', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app.title).toBe('Kyat Wise');
  });

  it('shows the cached space name for a pending change from another space', () => {
    const app = TestBed.createComponent(App).componentInstance;
    const name = (app as any).getSyncOperationSpaceName(
      { path: 'space_data/shop-1/incomes/sale-1' },
      { 'shop-1': { id: 'shop-1', type: 'group', name: 'North Shop' } },
      { uid: 'seller', currentSpaceName: 'South Shop' },
    );
    expect(name).toBe('North Shop');
  });
});
