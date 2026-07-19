import { Injectable, inject } from '@angular/core';
import {
  Database,
  ref,
  push,
  remove,
  listVal,
  get,
  query,
  orderByChild,
  equalTo,
  set,
  update,
} from '@angular/fire/database';
import { Observable, switchMap, firstValueFrom, of, combineLatest, map as rxMap, catchError } from 'rxjs';
import { AuthService } from './auth';
import { CategoryService } from './category';
import { IUserProfile, IInvitation } from '../core/models/data';
import { UserDataService } from './user-data';
import { Invitation } from './invitation.service';
import { SpaceContextService } from './space-context.service';
import { ImageUploadService } from './image-upload.service';
import { Space } from './space.model';

export const MAX_SPACE_NAME_LENGTH = 50;

// New interface for the combined member data
export interface IGroupMemberDetails extends IUserProfile {
  role: string; // Add role to the user profile data
}

@Injectable({
  providedIn: 'root',
})
export class DataManagerService {
  private db: Database = inject(Database);
  private authService: AuthService = inject(AuthService);
  private userDataService: UserDataService = inject(UserDataService);
  private spaceContextService: SpaceContextService = inject(SpaceContextService);
  private categoryService: CategoryService = inject(CategoryService);
  private imageUploadService: ImageUploadService = inject(ImageUploadService);

  /**
   * Validates a candidate group name (required, max length, per-account
   * space limit, no duplicate among groups this user owns) and returns the
   * trimmed name. Shared by createGroup() and by the create-group modal's
   * own pre-submit validation, so a duplicate-name rejection surfaces
   * inline in the still-open modal instead of only after it has closed.
   */
  async validateNewGroupName(groupName: string, userId: string): Promise<string> {
    const trimmedName = groupName.trim();
    if (!trimmedName) {
      throw new Error('Group name is required.');
    }
    if (trimmedName.length > MAX_SPACE_NAME_LENGTH) {
      throw new Error('Group name is too long.');
    }

    const userProfile = await firstValueFrom(this.userDataService.getUserProfile(userId));

    const personalSpaceId = userProfile?.personalSpaceId || '';
    const ownedGroupSpaces = Object.entries(userProfile?.spaceMemberships || {})
      .filter(([spaceId, role]) =>
        role === 'owner' &&
        spaceId !== personalSpaceId &&
        !spaceId.startsWith('personal:')
      );
    if (ownedGroupSpaces.length >= 5) {
      throw new Error('Space limit reached.');
    }

    const existingNames = await Promise.all(
      ownedGroupSpaces.map(async ([spaceId]) => {
        const spaceSnap = await get(ref(this.db, `spaces/${spaceId}/name`));
        return spaceSnap.exists() ? (spaceSnap.val() as string).trim().toLowerCase() : null;
      })
    );
    if (existingNames.some(name => name === trimmedName.toLowerCase())) {
      throw new Error('Duplicate group name.');
    }

    return trimmedName;
  }

  async createGroup(groupName: string, language: string, imageUrl?: string | null): Promise<string> {
    const userId = (await firstValueFrom(
      this.authService.currentUser$.pipe(rxMap((user) => user?.uid))
    ))!;
    if (!userId) {
      throw new Error('User not authenticated.');
    }

    const trimmedName = await this.validateNewGroupName(groupName, userId);
    const userProfile = await firstValueFrom(this.userDataService.getUserProfile(userId));

    const spaceRef = push(ref(this.db, 'spaces'));
    const newGroupId = spaceRef.key!;
    if (!newGroupId) {
      throw new Error('Failed to create new space ID.');
    }

    // The space record must exist before the owner membership write —
    // security rules verify spaces/$spaceId/ownerId === auth.uid for the
    // owner's self-membership, and a single multi-path update would be
    // evaluated against the pre-write state where the space doesn't exist.
    await set(spaceRef, {
      type: 'group',
      name: trimmedName,
      ownerId: userId,
      currency: userProfile?.currency || 'MMK',
      budgetPeriod: userProfile?.budgetPeriod || null,
      budgetStartDate: userProfile?.budgetStartDate || null,
      budgetEndDate: userProfile?.budgetEndDate || null,
      selectedBudgetPeriodId: userProfile?.selectedBudgetPeriodId || null,
      createdAt: Date.now(),
      ...(imageUrl ? { imageUrl } : {}),
    });

    const updates: { [key: string]: any } = {};
    updates[`/space_members/${newGroupId}/${userId}`] = { role: 'owner' };
    updates[`/users/${userId}/accountType`] = 'group';
    updates[`/users/${userId}/currentSpaceId`] = newGroupId;
    updates[`/users/${userId}/currentSpaceType`] = 'group';
    updates[`/users/${userId}/currentSpaceName`] = trimmedName;
    updates[`/users/${userId}/currentSpaceRole`] = 'owner';
    updates[`/users/${userId}/spaceMemberships/${newGroupId}`] = 'owner';

    await update(ref(this.db), updates);

    await this.categoryService.addDefaultGroupCategories(newGroupId, language);

    return newGroupId;
  }

  async updateGroupSettings(groupId: string, settings: Partial<Space>): Promise<void> {
    await update(ref(this.db, `spaces/${groupId}`), settings);
  }

  async renameGroup(groupId: string, nextName: string): Promise<void> {
    const trimmedName = nextName.trim();
    if (!trimmedName) {
      throw new Error('Group name is required.');
    }
    if (trimmedName.length > MAX_SPACE_NAME_LENGTH) {
      throw new Error('Group name is too long.');
    }

    const updates: Record<string, unknown> = {
      [`/spaces/${groupId}/name`]: trimmedName,
    };

    const memberSnapshot = await get(ref(this.db, `space_members/${groupId}`));
    if (memberSnapshot.exists()) {
      const memberIds = Object.keys(memberSnapshot.val() || {});
      await Promise.all(
        memberIds.map(async (memberId) => {
          const profile = await this.userDataService.fetchUserProfile(memberId);
          if (profile?.currentSpaceId === groupId) {
            updates[`/users/${memberId}/currentSpaceName`] = trimmedName;
          }
        }),
      );
    }

    await update(ref(this.db), updates);
  }

  async deleteGroup(groupId: string, actorId: string): Promise<void> {
    const spaceSnapshot = await get(ref(this.db, `spaces/${groupId}`));
    if (!spaceSnapshot.exists()) {
      throw new Error('Group not found.');
    }

    const space = spaceSnapshot.val() as Space;
    if (space.ownerId !== actorId) {
      throw new Error('Only the group owner can delete this space.');
    }

    const memberSnapshot = await get(ref(this.db, `space_members/${groupId}`));
    const members = memberSnapshot.exists() ? (memberSnapshot.val() as Record<string, { role: string }>) : {};
    const otherMemberIds = Object.keys(members).filter((memberId) => memberId !== actorId);

    if (otherMemberIds.length > 0) {
      throw new Error('Remove all other members before deleting this space.');
    }

    const invitationSnapshot = await get(
      query(ref(this.db, 'invitations'), orderByChild('groupId'), equalTo(groupId)),
    );
    const invitations = invitationSnapshot.exists()
      ? (invitationSnapshot.val() as Record<string, { status?: string }>)
      : {};
    const pendingInvitationIds = Object.entries(invitations)
      .filter(([, invitation]) => invitation?.status === 'pending')
      .map(([inviteId]) => inviteId);

    if (pendingInvitationIds.length > 0) {
      throw new Error('Revoke all pending invitations before deleting this space.');
    }

    const actorProfile = await this.userDataService.fetchUserProfile(actorId);
    if (!actorProfile) {
      throw new Error('User profile not found.');
    }

    const personalSpaceId =
      actorProfile.personalSpaceId ||
      (await this.spaceContextService.ensurePersonalSpace(actorId));

    // Collect Cloudinary assets that die with this group — the space photo
    // plus every voucher image stored under it — BEFORE their records are
    // removed below. Best-effort: a failed read just means those assets
    // linger in storage.
    const orphanedPublicIds: (string | null)[] = [
      this.imageUploadService.publicIdFromUrl(space.imageUrl),
    ];
    for (const vouchersPath of [`space_data/${groupId}/vouchers`, `group_data/${groupId}/vouchers`]) {
      try {
        const vouchersSnapshot = await get(ref(this.db, vouchersPath));
        if (vouchersSnapshot.exists()) {
          for (const voucher of Object.values(vouchersSnapshot.val() as Record<string, any>)) {
            const paths: string[] = voucher?.storagePaths?.length
              ? voucher.storagePaths
              : [voucher?.storagePath];
            orphanedPublicIds.push(...paths);
          }
        }
      } catch {
        // Read denied/failed — skip; the DB removal below is what matters.
      }
    }

    // Each removal below is its own independent request (not one atomic
    // multi-location update()) so that a rule denial on any single path is
    // both visible (logged with exactly which path failed, instead of an
    // opaque "update at /" for the whole batch) and doesn't block the
    // others from going through. group_data/space_data are auxiliary child
    // collections — best-effort, a denial there shouldn't stop the group
    // itself and the actor's membership from being removed.
    const auxiliaryPaths = [`group_data/${groupId}`, `space_data/${groupId}`];
    for (const path of auxiliaryPaths) {
      try {
        await remove(ref(this.db, path));
      } catch (error) {
        console.warn(`[DataManagerService] Failed to remove /${path} while deleting group ${groupId}:`, error);
      }
    }

    await remove(ref(this.db, `spaces/${groupId}`));

    await update(ref(this.db, `users/${actorId}`), {
      accountType: 'personal',
      currentSpaceId: personalSpaceId,
      currentSpaceType: 'personal',
      currentSpaceRole: 'owner',
      currentSpaceName: 'My Personal',
      [`spaceMemberships/${groupId}`]: null,
    });

    for (const inviteId of Object.keys(invitations)) {
      try {
        await remove(ref(this.db, `invitations/${inviteId}`));
      } catch (error) {
        console.warn(`[DataManagerService] Failed to remove invitation ${inviteId}:`, error);
      }
    }

    // Free the Cloudinary assets before the membership entry goes away —
    // the delete-images endpoint authorizes vouchers/spaces/{id} paths via
    // that same membership record. Awaited (deleteImages never throws) so
    // the check can't race the removal below.
    await this.imageUploadService.deleteImages(orphanedPublicIds);

    // Remove the membership entry last: spaces/group_data/space_data write
    // rules are gated on the actor still being a member of this group, so
    // removing it any earlier risks invalidating those checks mid-flight.
    await remove(ref(this.db, `space_members/${groupId}`));
  }

  async acceptGroupInvitation(inviteCode: string, userId: string): Promise<void> {
    const inviteRef = ref(this.db, `invitations/${inviteCode}`);
    const inviteSnapshot = await get(inviteRef);

    if (!inviteSnapshot.exists()) {
      throw new Error('Invitation not found');
    }

    const invitation = inviteSnapshot.val() as Invitation;

    if (invitation.status !== 'pending') {
      throw new Error('Invitation is not pending');
    }

    const groupId = invitation.groupId;
    const role = 'member'; // Default role for new members

    const space = await firstValueFrom(this.spaceContextService.getSpace(groupId));

    const updates: { [key: string]: any } = {};
    // inviteCode is stored on the membership record so security rules can
    // verify the join against a matching pending invitation.
    updates[`/space_members/${groupId}/${userId}`] = { role, inviteCode };
    updates[`/users/${userId}/accountType`] = 'group';
    updates[`/users/${userId}/currentSpaceId`] = groupId;
    updates[`/users/${userId}/currentSpaceType`] = 'group';
    updates[`/users/${userId}/currentSpaceName`] = space?.name || 'Group';
    updates[`/users/${userId}/currentSpaceRole`] = role;
    updates[`/users/${userId}/spaceMemberships/${groupId}`] = role;
    updates[`/invitations/${inviteCode}/status`] = 'accepted';
    updates[`/invitations/${inviteCode}/acceptedBy`] = userId;
    updates[`/invitations/${inviteCode}/acceptedAt`] = new Date().toISOString();

    await update(ref(this.db), updates);
  }

  getSpaceMembersWithProfile(spaceId: string): Observable<IGroupMemberDetails[]> {
    const membersRef = ref(this.db, `space_members/${spaceId}`);
    return listVal<any>(membersRef, { keyField: 'uid' }).pipe(
      switchMap(members => {
        if (!members || members.length === 0) {
          return of([]);
        }
        const memberProfiles$ = members.map(member =>
          // The public mirror (name + photo) is always readable and is the
          // reliable source for display identity. The full profile is
          // best-effort on top of that, purely to enrich with fields like
          // email when the reader legitimately shares a space with them —
          // if that read fails, the member still shows up correctly.
          combineLatest([
            this.userDataService.getPublicProfile(member.uid).pipe(catchError(() => of(null))),
            this.userDataService.getUserProfile(member.uid).pipe(catchError(() => of(null))),
          ]).pipe(
            rxMap(([publicProfile, fullProfile]) => ({
              ...fullProfile,
              ...publicProfile,
              uid: member.uid, // ensure uid is carried over
              role: member.role, // combine role from space_members
              displayName: publicProfile?.displayName || fullProfile?.displayName || 'Unknown Member',
            } as IGroupMemberDetails)),
          )
        );
        return combineLatest(memberProfiles$);
      })
    );
  }

  async removeGroupMember(groupId: string, memberId: string): Promise<void> {
    const userProfile = await firstValueFrom(this.userDataService.getUserProfile(memberId));
    const fallbackSpaceId =
      userProfile?.personalSpaceId ||
      `personal:${memberId}`;

    const updates: { [key: string]: any } = {};
    updates[`/space_members/${groupId}/${memberId}`] = null;
    updates[`/users/${memberId}/spaceMemberships/${groupId}`] = null;

    if (userProfile?.currentSpaceId === groupId) {
      updates[`/users/${memberId}/currentSpaceId`] = fallbackSpaceId;
      updates[`/users/${memberId}/currentSpaceType`] = 'personal';
      updates[`/users/${memberId}/currentSpaceName`] = 'My Personal';
      updates[`/users/${memberId}/currentSpaceRole`] = 'owner';
      updates[`/users/${memberId}/accountType`] = 'personal';
    }

    await update(ref(this.db), updates);
  }

  getPendingInvitations(groupId: string): Observable<IInvitation[]> {
    const invitesRef = query(
      ref(this.db, 'invitations'),
      orderByChild('groupId'),
      equalTo(groupId)
    );
    return listVal<IInvitation>(invitesRef, { keyField: 'key' }).pipe(
      rxMap((invites) => invites.filter(inv => inv.status === 'pending'))
    );
  }

  async revokeGroupInvitation(inviteKey: string): Promise<void> {
    const inviteRef = ref(this.db, `invitations/${inviteKey}`);
    return remove(inviteRef);
  }
}
