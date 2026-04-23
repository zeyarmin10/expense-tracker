import { Injectable, inject } from '@angular/core';
import {
  Database,
  get,
  objectVal,
  push,
  ref,
  update,
} from '@angular/fire/database';
import { Observable, combineLatest, map, of, switchMap } from 'rxjs';
import { CategoryService } from './category';
import { Space, SpaceRole, UserSpaceSummary } from './space.model';
import { UserDataService } from './user-data';

@Injectable({
  providedIn: 'root',
})
export class SpaceContextService {
  private db = inject(Database);
  private userDataService = inject(UserDataService);
  private categoryService = inject(CategoryService);
  private readonly virtualPersonalPrefix = 'personal:';

  private isVirtualPersonalSpaceId(spaceId: string | null | undefined): boolean {
    return !!spaceId && spaceId.startsWith(this.virtualPersonalPrefix);
  }

  private buildVirtualPersonalSpaceId(userId: string): string {
    return `${this.virtualPersonalPrefix}${userId}`;
  }

  private isPermissionDenied(error: any): boolean {
    return (
      error?.code === 'PERMISSION_DENIED' ||
      error?.message === 'permission_denied'
    );
  }

  private async trySyncLegacyGroupAsSpace(
    groupId: string,
    userId: string,
    role: SpaceRole,
  ): Promise<void> {
    const groupSnapshot = await get(ref(this.db, `groups/${groupId}`));
    if (!groupSnapshot.exists()) {
      return;
    }

    const group = groupSnapshot.val();
    const updates: Record<string, unknown> = {
      [`/space_members/${groupId}/${userId}`]: { role },
    };

    if (role === 'admin' || role === 'owner') {
      updates[`/spaces/${groupId}`] = {
        type: 'group',
        name: group.groupName,
        ownerId: group.ownerId,
        currency: group.currency,
        budgetPeriod: group.budgetPeriod || null,
        budgetStartDate: group.budgetStartDate || null,
        budgetEndDate: group.budgetEndDate || null,
        selectedBudgetPeriodId: group.selectedBudgetPeriodId || null,
        createdAt: group.createdAt || Date.now(),
      };
    }

    try {
      await update(ref(this.db), updates);
    } catch (error: any) {
      if (!this.isPermissionDenied(error)) {
        throw error;
      }
    }
  }

  getSpace(spaceId: string | null | undefined): Observable<Space | null> {
    if (!spaceId) {
      return of(null);
    }

    if (this.isVirtualPersonalSpaceId(spaceId)) {
      const userId = spaceId.replace(this.virtualPersonalPrefix, '');
      return this.userDataService.getUserProfile(userId).pipe(
        map((profile) =>
          profile
            ? {
                id: spaceId,
                type: 'personal',
                name: profile.currentSpaceName || 'My Personal',
                ownerId: userId,
                currency: profile.currency || 'MMK',
                budgetPeriod: profile.budgetPeriod || null,
                budgetStartDate: profile.budgetStartDate || null,
                budgetEndDate: profile.budgetEndDate || null,
                selectedBudgetPeriodId: profile.selectedBudgetPeriodId || null,
                createdAt: profile.createdAt || Date.now(),
              }
            : null,
        ),
      );
    }

    const spaceRef = ref(this.db, `spaces/${spaceId}`);
    const legacyGroupRef = ref(this.db, `groups/${spaceId}`);

    return objectVal<Space | null>(spaceRef).pipe(
      switchMap((space) => {
        if (space) {
          return of({ ...space, id: spaceId });
        }

        return objectVal<any>(legacyGroupRef).pipe(
          map((group) => {
            if (!group) {
              return null;
            }

            const legacySpace: Space = {
              id: spaceId,
              type: 'group',
              name: group.groupName,
              ownerId: group.ownerId,
              currency: group.currency,
              budgetPeriod: group.budgetPeriod || null,
              budgetStartDate: group.budgetStartDate || null,
              budgetEndDate: group.budgetEndDate || null,
              selectedBudgetPeriodId: group.selectedBudgetPeriodId || null,
              createdAt: group.createdAt || null,
            };

            return legacySpace;
          }),
        );
      }),
    );
  }

  getUserSpaces(userId: string): Observable<UserSpaceSummary[]> {
    return this.userDataService.getUserProfile(userId).pipe(
      switchMap((profile) => {
        const memberships = profile?.spaceMemberships || {};
        const personalSpaceId =
          profile?.personalSpaceId || (profile?.uid ? this.buildVirtualPersonalSpaceId(profile.uid) : null);
        const entries = Object.entries(memberships).filter(
          ([spaceId]) => spaceId !== personalSpaceId,
        );
        const personalSpace$: Observable<UserSpaceSummary | null> = personalSpaceId
          ? of({
              id: personalSpaceId,
              type: 'personal' as const,
              name: 'My Personal',
              ownerId: userId,
              currency: profile?.currency || 'MMK',
              budgetPeriod: profile?.budgetPeriod || null,
              budgetStartDate: profile?.budgetStartDate || null,
              budgetEndDate: profile?.budgetEndDate || null,
              selectedBudgetPeriodId: profile?.selectedBudgetPeriodId || null,
              createdAt: profile?.createdAt || Date.now(),
              role: 'owner' as const,
            })
          : of(null);

        if (entries.length === 0) {
          return personalSpace$.pipe(
            map((space) => (space ? [space] : [])),
          );
        }

        return combineLatest(
          [personalSpace$, ...entries.map(([spaceId, role]) =>
            this.getSpace(spaceId).pipe(
              map((space) =>
                space
                  ? {
                      ...space,
                      role,
                    }
                  : null,
              ),
            ),
          )],
        ).pipe(
          map((spaces) => {
            const filtered = spaces.filter(
              (space): space is UserSpaceSummary => !!space,
            );

            const deduped = new Map<string, UserSpaceSummary>();
            for (const space of filtered) {
              if (!deduped.has(space.id!)) {
                deduped.set(space.id!, space);
              }
            }

            return [...deduped.values()];
          }),
        );
      }),
    );
  }

  async ensurePersonalSpace(userId: string): Promise<string> {
    const profile = await this.userDataService.fetchUserProfile(userId);
    if (!profile) {
      throw new Error('User profile not found.');
    }

    if (profile.personalSpaceId) {
      const currentSpaceId = profile.currentSpaceId || profile.personalSpaceId;
      if (!profile.currentSpaceId) {
        await this.switchSpace(userId, currentSpaceId);
      }
      return profile.personalSpaceId;
    }

    const virtualPersonalSpaceId = this.buildVirtualPersonalSpaceId(userId);
    const personalSpaceRef = push(ref(this.db, 'spaces'));
    const personalSpaceId = personalSpaceRef.key;

    if (!personalSpaceId) {
      throw new Error('Failed to create personal space.');
    }

    const personalSpace: Space = {
      type: 'personal',
      name: 'My Personal',
      ownerId: userId,
      currency: profile.currency || 'MMK',
      budgetPeriod: profile.budgetPeriod || null,
      budgetStartDate: profile.budgetStartDate || null,
      budgetEndDate: profile.budgetEndDate || null,
      selectedBudgetPeriodId: profile.selectedBudgetPeriodId || null,
      createdAt: Date.now(),
    };

    const updates: Record<string, unknown> = {
      [`/spaces/${personalSpaceId}`]: personalSpace,
      [`/space_members/${personalSpaceId}/${userId}`]: { role: 'owner' },
      [`/users/${userId}/personalSpaceId`]: personalSpaceId,
      [`/users/${userId}/currentSpaceId`]:
        profile.currentSpaceId || profile.groupId || personalSpaceId,
      [`/users/${userId}/currentSpaceType`]:
        profile.currentSpaceType || (profile.groupId ? 'group' : 'personal'),
      [`/users/${userId}/spaceMemberships/${personalSpaceId}`]: 'owner',
      [`/users/${userId}/accountType`]:
        profile.accountType || (profile.groupId ? 'group' : 'personal'),
      [`/users/${userId}/groupId`]: profile.groupId || null,
    };

    try {
      await update(ref(this.db), updates);
    } catch (error: any) {
      if (!this.isPermissionDenied(error)) {
        throw error;
      }

      await update(ref(this.db, `users/${userId}`), {
        personalSpaceId: virtualPersonalSpaceId,
        currentSpaceId:
          profile.currentSpaceId || profile.groupId || virtualPersonalSpaceId,
        currentSpaceType:
          profile.currentSpaceType || (profile.groupId ? 'group' : 'personal'),
        currentSpaceName:
          profile.currentSpaceName ||
          (profile.groupId ? undefined : 'My Personal'),
        currentSpaceRole:
          profile.currentSpaceRole ||
          (profile.groupId ? undefined : 'owner'),
        spaceMemberships: {
          ...(profile.spaceMemberships || {}),
          [virtualPersonalSpaceId]: 'owner',
        },
        accountType:
          profile.accountType || (profile.groupId ? 'group' : 'personal'),
        groupId: profile.groupId || null,
      });

      const personalCategoriesSnapshot = await get(ref(this.db, `users/${userId}/categories`));
      if (!personalCategoriesSnapshot.exists()) {
        const language = profile.language || 'my';
        await this.categoryService.addDefaultCategories(userId, language);
      }

      return virtualPersonalSpaceId;
    }

    const language = profile.language || 'my';
    const personalCategoriesSnapshot = await get(ref(this.db, `users/${userId}/categories`));
    if (!personalCategoriesSnapshot.exists()) {
      await this.categoryService.addDefaultCategories(userId, language);
    }

    return personalSpaceId;
  }

  async migrateLegacyUserToSpaces(userId: string): Promise<void> {
    const initialProfile = await this.userDataService.fetchUserProfile(userId);
    if (!initialProfile) {
      return;
    }

    const personalSpaceId = await this.ensurePersonalSpace(userId);
    const profile = (await this.userDataService.fetchUserProfile(userId)) || initialProfile;

    const legacyRoleEntries = Object.entries(profile.roles || {}) as Array<
      [string, SpaceRole | 'member']
    >;
    const legacyGroupIds = new Set<string>();

    if (profile.groupId) {
      legacyGroupIds.add(profile.groupId);
    }

    for (const [groupId] of legacyRoleEntries) {
      legacyGroupIds.add(groupId);
    }

    const nextMemberships: Record<string, SpaceRole> = {
      ...(profile.spaceMemberships || {}),
      [personalSpaceId]: 'owner',
    };

    for (const groupId of legacyGroupIds) {
      const role =
        (profile.spaceMemberships?.[groupId] ||
          profile.roles?.[groupId] ||
          'member') as SpaceRole;
      nextMemberships[groupId] = role;
      await this.trySyncLegacyGroupAsSpace(groupId, userId, role);
    }

    const currentSpaceId =
      profile.currentSpaceId ||
      profile.groupId ||
      personalSpaceId;
    const isPersonalCurrent =
      currentSpaceId === personalSpaceId ||
      this.isVirtualPersonalSpaceId(currentSpaceId);

    let currentSpaceName = profile.currentSpaceName || 'My Personal';
    if (!isPersonalCurrent) {
      const groupSnapshot = await get(ref(this.db, `groups/${currentSpaceId}`));
      if (groupSnapshot.exists()) {
        currentSpaceName =
          groupSnapshot.val()?.groupName || currentSpaceName;
      }
    }

    await update(ref(this.db, `users/${userId}`), {
      personalSpaceId,
      currentSpaceId,
      currentSpaceType: isPersonalCurrent ? 'personal' : 'group',
      currentSpaceName,
      currentSpaceRole: isPersonalCurrent
        ? 'owner'
        : nextMemberships[currentSpaceId] || 'member',
      spaceMemberships: nextMemberships,
      accountType: isPersonalCurrent ? 'personal' : 'group',
      groupId: isPersonalCurrent ? null : currentSpaceId,
    });
  }

  async switchSpace(userId: string, spaceId: string): Promise<void> {
    const profile = await this.userDataService.fetchUserProfile(userId);
    if (!profile?.spaceMemberships?.[spaceId] && profile?.personalSpaceId !== spaceId) {
      throw new Error('Space access denied.');
    }

    if (this.isVirtualPersonalSpaceId(spaceId)) {
      await update(ref(this.db, `users/${userId}`), {
        currentSpaceId: spaceId,
        currentSpaceType: 'personal',
        currentSpaceName: 'My Personal',
        currentSpaceRole: 'owner',
        accountType: 'personal',
        groupId: null,
      });
      return;
    }

    const spaceSnapshot = await get(ref(this.db, `spaces/${spaceId}`));
    const legacyGroupSnapshot = await get(ref(this.db, `groups/${spaceId}`));

    const space = (spaceSnapshot.exists()
      ? spaceSnapshot.val()
      : legacyGroupSnapshot.exists()
        ? {
            ...legacyGroupSnapshot.val(),
            type: 'group',
          }
        : null) as Partial<Space> | null;

    if (!space) {
      throw new Error('Space not found.');
    }

    const isGroup = space.type === 'group';

    await update(ref(this.db, `users/${userId}`), {
      currentSpaceId: spaceId,
      currentSpaceType: isGroup ? 'group' : 'personal',
      accountType: isGroup ? 'group' : 'personal',
      groupId: isGroup ? spaceId : null,
    });
  }
}
