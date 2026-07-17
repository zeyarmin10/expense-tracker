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
});
