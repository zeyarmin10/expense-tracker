import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { Database } from '@angular/fire/database';
import { BehaviorSubject } from 'rxjs';
import { GroupOfflineAccessService } from './group-offline-access.service';
import { NetworkService } from './network.service';
import { OfflineStoreService } from './offline-store.service';
import { PersonalOfflineDataService } from './personal-offline-data.service';
import { SharedOfflineDataService } from './shared-offline-data.service';
import { UserProfile } from './user-data';

describe('Web online-only data access', () => {
  const profile: UserProfile = {
    uid: 'user-1',
    email: 'test@example.com',
    displayName: 'Test',
    currency: 'MMK',
    language: 'en',
    createdAt: 1,
  };
  const groupProfile: UserProfile = {
    ...profile,
    currentSpaceId: 'group-1',
    currentSpaceType: 'group',
    groupId: 'group-1',
  };
  let store: jasmine.SpyObj<OfflineStoreService>;

  beforeEach(() => {
    store = jasmine.createSpyObj<OfflineStoreService>('OfflineStoreService', [
      'enqueue', 'replaceCollection', 'patchRecord',
    ]);
    TestBed.configureTestingModule({
      providers: [
        PersonalOfflineDataService,
        SharedOfflineDataService,
        { provide: NetworkService, useValue: { isOnline$: new BehaviorSubject(false) } },
        { provide: Database, useValue: {} },
        { provide: OfflineStoreService, useValue: store },
        { provide: GroupOfflineAccessService, useValue: {} },
      ],
    });
  });

  it('does not enter local mode or queue edits when the web loses connection', async () => {
    const personal = TestBed.inject(PersonalOfflineDataService);
    const shared = TestBed.inject(SharedOfflineDataService);

    expect(personal.isOfflinePersonal(profile)).toBeFalse();
    expect(shared.isOfflineShared(groupProfile)).toBeFalse();
    await expectAsync(personal.write(profile, 'expenses', 'set', 'expense-1', {}))
      .toBeRejectedWithError('WEB_REQUIRES_INTERNET');
    await expectAsync(shared.write(groupProfile, 'expenses', 'set', 'expense-1', {}))
      .toBeRejectedWithError('WEB_REQUIRES_INTERNET');
    expect(store.patchRecord).not.toHaveBeenCalled();
    expect(store.enqueue).not.toHaveBeenCalled();
  });

  it('uses the live Firebase connection to unlock web without a separate probe', fakeAsync(() => {
    TestBed.overrideProvider(NetworkService, {
      useFactory: () => new NetworkService(),
      deps: [],
    });
    const network = TestBed.inject(NetworkService);
    const updateWebConnection = (connected: boolean) =>
      (network as unknown as { updateWebConnection(connected: boolean): void })
        .updateWebConnection(connected);

    updateWebConnection(true);
    expect(network.isOnline$.value).toBeTrue();

    // A failed profile request must report its own error, not hide the app.
    network.markServerUnavailable();
    expect(network.isOnline$.value).toBeTrue();

    updateWebConnection(false);
    expect(network.isOnline$.value).toBeFalse();
    expect(network.isConfirmedWebUnavailable$.value).toBeFalse();
    tick(2000);
    expect(network.isConfirmedWebUnavailable$.value).toBeTrue();
  }));

  it('does not show the web connection screen for a startup connection blip', fakeAsync(() => {
    TestBed.overrideProvider(NetworkService, {
      useFactory: () => new NetworkService(),
      deps: [],
    });
    const network = TestBed.inject(NetworkService);
    const updateWebConnection = (connected: boolean) =>
      (network as unknown as { updateWebConnection(connected: boolean): void })
        .updateWebConnection(connected);

    updateWebConnection(false);
    tick(3000);
    expect(network.isConfirmedWebUnavailable$.value).toBeFalse();

    updateWebConnection(true);
    tick(5000);
    expect(network.isOnline$.value).toBeTrue();
    expect(network.isConfirmedWebUnavailable$.value).toBeFalse();
  }));

  it('shows the web connection screen when startup stays disconnected', fakeAsync(() => {
    TestBed.overrideProvider(NetworkService, {
      useFactory: () => new NetworkService(),
      deps: [],
    });
    const network = TestBed.inject(NetworkService);
    (network as unknown as { updateWebConnection(connected: boolean): void })
      .updateWebConnection(false);

    tick(4999);
    expect(network.isConfirmedWebUnavailable$.value).toBeFalse();
    tick(1);
    expect(network.isConfirmedWebUnavailable$.value).toBeTrue();
  }));
});
