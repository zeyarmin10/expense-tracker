import { Injectable, inject } from '@angular/core';
import {
  Database,
  get,
  objectVal,
  push,
  ref,
  set,
  update,
} from '@angular/fire/database';
import { Observable, combineLatest, map, of, switchMap, catchError } from 'rxjs';
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
    // The SDK reports denials in several shapes: listener cancellations
    // carry code 'PERMISSION_DENIED' / message 'permission_denied at ...',
    // while a one-shot get() throws a plain Error('Permission denied') with
    // no code at all — match all of them.
    return (
      String(error?.code || '').toUpperCase() === 'PERMISSION_DENIED' ||
      /^permission[ _]denied/i.test(String(error?.message || ''))
    );
  }

  // Accounts whose space predates the /space_members backfill (or that hit
  // the permission-denied fallback in ensurePersonalSpace) never got a
  // /space_members/{spaceId}/{uid} entry written, even though their own
  // profile (spaceMemberships / personalSpaceId) claims access. Since the
  // deployed database rules authorize /spaces and /space_data reads off of
  // /space_members, that mismatch shows up as "permission denied" when
  // switching back into a space the user legitimately owns. Self-heal by
  // writing the missing entry (best-effort) before the read that depends on it.
  private async ensureOwnSpaceMembership(
    userId: string,
    spaceId: string,
    role: SpaceRole,
  ): Promise<void> {
    try {
      const memberSnapshot = await get(ref(this.db, `space_members/${spaceId}/${userId}`));
      if (!memberSnapshot.exists()) {
        await update(ref(this.db), {
          [`/space_members/${spaceId}/${userId}`]: { role },
        });
      }
    } catch (error: any) {
      if (!this.isPermissionDenied(error)) {
        throw error;
      }
      console.warn(
        `[SpaceContextService] Could not self-heal space_members/${spaceId}/${userId} — ` +
        `the current database rules don't allow this account to backfill its own membership record.`,
      );
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
                imageUrl: (profile as any).spaceImageUrl || (profile as any).photoURL || null,
                createdAt: profile.createdAt || Date.now(),
              }
            : null,
        ),
      );
    }

    const spaceRef = ref(this.db, `spaces/${spaceId}`);
    const legacyGroupRef = ref(this.db, `groups/${spaceId}`);
    // The /groups read is denied for spaces that never had a legacy record
    // (anything created directly under /spaces has no /group_members entry,
    // which the /groups read rule requires). A denied legacy read must mean
    // "no legacy data", never an error — otherwise it kills the whole
    // stream it's embedded in (userProfile$ has no catchError, and
    // getUserSpaces would silently drop the space from the list).
    const legacyGroup$ = objectVal<any>(legacyGroupRef).pipe(
      catchError(() => of(null)),
    );

    return objectVal<Space | null>(spaceRef).pipe(
      switchMap((space) => {
        if (space) {
          // If imageUrl is already set, no extra read needed. Personal
          // spaces also never have a /groups counterpart to backfill from —
          // only pre-image-support GROUP spaces do — so skip the legacy
          // read entirely for anything that isn't a group (it would only
          // ever be denied, since personal spaces have no /group_members).
          if (space.imageUrl || space.type !== 'group') {
            return of({ ...space, id: spaceId });
          }
          // Backfill imageUrl from groups node for spaces that predate image support
          return legacyGroup$.pipe(
            map((group) => ({
              ...space,
              id: spaceId,
              imageUrl: group?.imageUrl || group?.avatarUrl || group?.logoUrl || group?.photoURL || null,
            })),
          );
        }

        return legacyGroup$.pipe(
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
              imageUrl: group.imageUrl || group.avatarUrl || group.logoUrl || group.photoURL || null,
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
              imageUrl: (profile as any)?.spaceImageUrl || (profile as any)?.photoURL || null,
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
              // A stale/orphaned membership entry (e.g. permission denied on a
              // space that no longer has valid member data) must not take down
              // the whole list — drop just that entry instead.
              catchError(() => of(null)),
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

  // Several callers can race here in one session (signup flow, login
  // self-heal, app-start self-heal) — without single-flighting, two
  // concurrent runs would each push a fresh /spaces record and the loser's
  // space would be orphaned.
  private readonly ensuringPersonalSpaces = new Map<string, Promise<string>>();

  ensurePersonalSpace(userId: string): Promise<string> {
    const inFlight = this.ensuringPersonalSpaces.get(userId);
    if (inFlight) {
      return inFlight;
    }

    const promise = this.doEnsurePersonalSpace(userId).finally(() => {
      this.ensuringPersonalSpaces.delete(userId);
    });
    this.ensuringPersonalSpaces.set(userId, promise);
    return promise;
  }

  private async doEnsurePersonalSpace(userId: string): Promise<string> {
    const profile = await this.userDataService.fetchUserProfile(userId);
    if (!profile) {
      throw new Error('User profile not found.');
    }

    if (profile.personalSpaceId) {
      await this.ensureOwnSpaceMembership(userId, profile.personalSpaceId, 'owner');
      // A virtual current-space id is just a placeholder for "my personal
      // space" — upgrade it to the real one now that it exists, so data
      // access moves off the legacy users/{uid} paths.
      if (!profile.currentSpaceId || this.isVirtualPersonalSpaceId(profile.currentSpaceId)) {
        await this.switchSpace(userId, profile.personalSpaceId);
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
      imageUrl: (profile as any).spaceImageUrl || (profile as any).photoURL || null,
      createdAt: Date.now(),
    };

    // Same virtual-id upgrade as in the early-return branch above: a
    // 'personal:{uid}' current space should become the real one we create.
    const preservedCurrentSpaceId = this.isVirtualPersonalSpaceId(profile.currentSpaceId)
      ? null
      : profile.currentSpaceId;

    const updates: Record<string, unknown> = {
      [`/space_members/${personalSpaceId}/${userId}`]: { role: 'owner' },
      [`/users/${userId}/personalSpaceId`]: personalSpaceId,
      [`/users/${userId}/currentSpaceId`]:
        preservedCurrentSpaceId || profile.groupId || personalSpaceId,
      [`/users/${userId}/currentSpaceType`]:
        profile.currentSpaceType || (profile.groupId ? 'group' : 'personal'),
      [`/users/${userId}/spaceMemberships/${personalSpaceId}`]: 'owner',
      [`/users/${userId}/accountType`]:
        profile.accountType || (profile.groupId ? 'group' : 'personal'),
      [`/users/${userId}/groupId`]: profile.groupId || null,
    };

    try {
      // The space record must exist before the owner membership write —
      // security rules verify spaces/$spaceId/ownerId === auth.uid for the
      // owner's self-membership, and a single multi-path update would be
      // evaluated against the pre-write state where the space doesn't exist.
      await set(personalSpaceRef, personalSpace);
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

  async switchSpace(userId: string, spaceId: string): Promise<void> {
    if (this.isVirtualPersonalSpaceId(spaceId)) {
      const ownVirtualId = this.buildVirtualPersonalSpaceId(userId);
      if (spaceId !== ownVirtualId) {
        throw new Error('Space access denied.');
      }
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

    const profile = await this.userDataService.fetchUserProfile(userId);
    const membershipRole = profile?.spaceMemberships?.[spaceId];
    const isOwnPersonalSpace = profile?.personalSpaceId === spaceId;
    if (!membershipRole && !isOwnPersonalSpace) {
      throw new Error('Space access denied.');
    }

    await this.ensureOwnSpaceMembership(
      userId,
      spaceId,
      isOwnPersonalSpace ? 'owner' : membershipRole!,
    );

    const spaceSnapshot = await get(ref(this.db, `spaces/${spaceId}`));

    // Only fall back to the legacy path when the canonical one truly has
    // nothing — personal spaces (and any space fully migrated to /spaces)
    // never have a /group_members entry, so this read would otherwise be
    // denied every time for them, even though it's never actually needed.
    // A denied legacy read means "no legacy data", not a failed switch.
    let legacyGroupSnapshot = null;
    if (!spaceSnapshot.exists()) {
      try {
        legacyGroupSnapshot = await get(ref(this.db, `groups/${spaceId}`));
      } catch (error: any) {
        if (!this.isPermissionDenied(error)) {
          throw error;
        }
      }
    }

    const space = (spaceSnapshot.exists()
      ? spaceSnapshot.val()
      : legacyGroupSnapshot?.exists()
        ? {
            ...legacyGroupSnapshot.val(),
            type: 'group',
          }
        : null) as Partial<Space> | null;

    if (!space) {
      if (profile?.personalSpaceId === spaceId) {
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
      throw new Error('Space not found.');
    }

    const isGroup = space.type === 'group';
    const role = isGroup
      ? profile?.spaceMemberships?.[spaceId] || 'member'
      : 'owner';

    await update(ref(this.db, `users/${userId}`), {
      currentSpaceId: spaceId,
      currentSpaceType: isGroup ? 'group' : 'personal',
      currentSpaceRole: role,
      accountType: isGroup ? 'group' : 'personal',
      groupId: isGroup ? spaceId : null,
    });
  }
}
