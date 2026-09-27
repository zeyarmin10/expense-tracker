import { TestBed } from '@angular/core/testing';

import { TEST_PROVIDERS } from '../testing/test-providers';
import { Capacitor } from '@capacitor/core';
import { firstValueFrom } from 'rxjs';

import { DataManagerService } from './data-manager';
import { NetworkService } from './network.service';
import { OfflineStoreService } from './offline-store.service';

describe('DataManagerService', () => {
  let service: DataManagerService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: TEST_PROVIDERS });
    service = TestBed.inject(DataManagerService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('shows the cached members of the active space on Android when offline', async () => {
    spyOn(Capacitor, 'isNativePlatform').and.returnValue(true);
    TestBed.inject(NetworkService).isOnline$.next(false);
    const offlineStore = TestBed.inject(OfflineStoreService);
    const viewerId = `member-cache-test-${Date.now()}`;
    await offlineStore.patchRecord(viewerId, 'spaceMembers', 'space-one', {
      members: [{ uid: 'member-one', role: 'admin', displayName: 'Aye', currency: '' }],
    });

    const members = await firstValueFrom(service.getSpaceMembersWithProfile('space-one', viewerId));
    const otherSpaceMembers = await firstValueFrom(service.getSpaceMembersWithProfile('space-two', viewerId));
    const otherViewerMembers = await firstValueFrom(service.getSpaceMembersWithProfile('space-one', 'another-viewer'));

    expect(members.map(member => member.displayName)).toEqual(['Aye']);
    expect(otherSpaceMembers).toEqual([]);
    expect(otherViewerMembers).toEqual([]);
  });
});
