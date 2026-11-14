import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  Database,
  get,
  push,
  ref as dbRef,
  remove,
  set,
  update,
  objectVal,
  query,
  orderByChild,
  startAt,
  endAt,
  limitToLast,
  QueryConstraint,
} from '@angular/fire/database';
import { Observable, firstValueFrom, from, of, combineLatest } from 'rxjs';
import { catchError, filter, map, switchMap } from 'rxjs/operators';
import { UAParser } from 'ua-parser-js';
import { DataIVoucher as IVoucher } from '../core/models/data';
import { AuthService } from './auth';
import { SpaceDataService } from './space-data.service';
import { SpaceSwitchLoadingService } from './space-switch-loading.service';
import { UserDataService, UserProfile, PublicUserProfile, getActiveGroupId } from './user-data';
import { ImageUploadService } from './image-upload.service';
import { environment } from '../../environments/environment';
import { PersonalOfflineDataService } from './personal-offline-data.service';
import { SharedOfflineDataService } from './shared-offline-data.service';
import { OfflineStoreService } from './offline-store.service';
import { NetworkService } from './network.service';

import { changedFields } from '../utils/changed-fields';
export type ServiceIVoucher = IVoucher & {
  id: string;
  createdByName?: string;
  createdByPhotoURL?: string | null;
  userDisplayName?: string;
  userPhotoURL?: string | null;
  /** Present only while a locally captured receipt is waiting for upload. */
  syncStatus?: 'pending' | 'synced';
  offlineFileKeys?: string[];
};

/**
 * Server-side slice of a space's vouchers, so years of history aren't
 * downloaded for a one-month view. Needs `.indexOn: ["date"]` on vouchers.
 */
export interface VoucherQuery {
  /** Inclusive `yyyy-MM-dd` bounds on the voucher date. */
  startDate?: string;
  endDate?: string;
  /** Only the N newest vouchers by date (gallery paging). */
  limit?: number;
}

export interface AddVoucherInput {
  date: string;
  title?: string;
  category?: string;
  note?: string;
  files: File[];
}

export interface VoucherImageRef {
  url: string;
  /** Cloudinary public id — empty for a not-yet-uploaded offline image. */
  publicId: string;
}

export interface UpdateVoucherInput {
  date: string;
  title?: string;
  category?: string;
  note?: string;
  /** Existing images to keep, in display order. */
  keptImages: VoucherImageRef[];
  /** Newly picked images appended after the kept ones. */
  newFiles: File[];
}

const MAX_IMAGES = 10;
const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.82;

@Injectable({
  providedIn: 'root',
})
export class VoucherService {
  private db = inject(Database);
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private userDataService = inject(UserDataService);
  private spaceDataService = inject(SpaceDataService);
  private spaceSwitchLoadingService = inject(SpaceSwitchLoadingService);
  private imageUploadService = inject(ImageUploadService);
  private personalOfflineData = inject(PersonalOfflineDataService);
  private sharedOfflineData = inject(SharedOfflineDataService);
  private offlineStore = inject(OfflineStoreService);
  private network = inject(NetworkService);

  private getProfilePhotoURL(profile: { photoURL?: string | null } | null | undefined): string | null {
    if (!profile) return null;
    const p = profile as any;
    return p.photoURL || p.avatarUrl || p.imageUrl || p.profileImageUrl || p.picture || null;
  }

  private sanitizeFileName(fileName: string): string {
    const extension = fileName.includes('.') ? fileName.split('.').pop() : '';
    const baseName = fileName
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'voucher';
    return extension ? `${baseName}.${extension.toLowerCase()}` : baseName;
  }

  private getTimestamp(value?: string): number {
    const time = value ? new Date(value).getTime() : 0;
    return Number.isFinite(time) ? time : 0;
  }

  private async compressImage(file: File): Promise<File> {
    if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') {
      return file;
    }

    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);

        let { width, height } = img;
        if (width <= MAX_DIMENSION && height <= MAX_DIMENSION && file.size < 300 * 1024) {
          resolve(file);
          return;
        }

        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width > height) {
            height = Math.round((height * MAX_DIMENSION) / width);
            width = MAX_DIMENSION;
          } else {
            width = Math.round((width * MAX_DIMENSION) / height);
            height = MAX_DIMENSION;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob || blob.size >= file.size) {
              resolve(file);
              return;
            }
            const compressed = new File(
              [blob],
              file.name.replace(/\.[^/.]+$/, '.jpg'),
              { type: 'image/jpeg' },
            );
            resolve(compressed);
          },
          'image/jpeg',
          JPEG_QUALITY,
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(file);
      };

      img.src = url;
    });
  }

  private async uploadToCloudinary(file: File, folder: string): Promise<{ url: string; publicId: string }> {
    const { cloudName, uploadPreset } = environment.cloudinary;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', uploadPreset);
    formData.append('folder', folder);

    const response = await firstValueFrom(
      this.http.post<{ secure_url: string; public_id: string }>(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        formData,
      ),
    );
    return { url: response.secure_url, publicId: response.public_id };
  }

  /**
   * Member name/photo lookups, shared across emissions. Every voucher change
   * re-emits the whole list; without this each emission re-fetched every
   * creator's/editor's profile. Short TTL so renamed members still update.
   */
  private readonly publicProfileCache = new Map<string, { at: number; profile: Promise<PublicUserProfile | null> }>();
  private static readonly PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;

  private getCachedPublicProfile(userId: string): Promise<PublicUserProfile | null> {
    const hit = this.publicProfileCache.get(userId);
    if (hit && Date.now() - hit.at < VoucherService.PROFILE_CACHE_TTL_MS) return hit.profile;
    const profile = firstValueFrom(this.userDataService.getPublicProfile(userId)).catch(() => null);
    this.publicProfileCache.set(userId, { at: Date.now(), profile });
    // Don't pin a miss (offline, permission blip): retry on the next emission.
    profile.then(found => {
      if (!found && this.publicProfileCache.get(userId)?.profile === profile) this.publicProfileCache.delete(userId);
    });
    return profile;
  }

  /** Applies a VoucherQuery to an already newest-first list (offline cache). */
  private applyQueryLocally(vouchers: ServiceIVoucher[], q?: VoucherQuery): ServiceIVoucher[] {
    if (!q) return vouchers;
    let result = vouchers;
    if (q.startDate) result = result.filter(v => (v.date || '') >= q.startDate!);
    if (q.endDate) result = result.filter(v => (v.date || '') <= q.endDate!);
    if (q.limit) result = result.slice(0, q.limit);
    return result;
  }

  private queryConstraints(q?: VoucherQuery): QueryConstraint[] {
    if (!q || (!q.startDate && !q.endDate && !q.limit)) return [];
    const constraints: QueryConstraint[] = [orderByChild('date')];
    if (q.startDate) constraints.push(startAt(q.startDate));
    if (q.endDate) constraints.push(endAt(q.endDate));
    if (q.limit) constraints.push(limitToLast(q.limit));
    return constraints;
  }

  /**
   * Which cached records a queried snapshot speaks for (see cacheRemote's
   * `covers`). A full limit page covers only dates strictly newer than its
   * oldest record — same-date siblings may have been cut off by the limit.
   */
  private queryCoverage(
    q: VoucherQuery | undefined,
    data: Record<string, Record<string, unknown>>,
  ): ((record: Record<string, unknown>) => boolean) | undefined {
    if (!q || (!q.startDate && !q.endDate && !q.limit)) return undefined;
    const inRange = (date: string) =>
      (!q.startDate || date >= q.startDate) && (!q.endDate || date <= q.endDate);
    const dates = Object.values(data).map(r => String(r['date'] || ''));
    if (q.limit && dates.length >= q.limit) {
      const oldest = dates.reduce((min, d) => (d < min ? d : min), dates[0]);
      return record => {
        const date = String(record['date'] || '');
        return inRange(date) && date > oldest;
      };
    }
    // Fewer than `limit` came back: everything in range was returned.
    return record => inRange(String(record['date'] || ''));
  }

  getVouchers(q?: VoucherQuery): Observable<ServiceIVoucher[]> {
    const profile$ = this.authService.userProfile$.pipe(
      filter((profile): profile is UserProfile => profile !== null),
    );

    return combineLatest([profile$, this.network.isOnline$]).pipe(
      switchMap(([profile]) => {
        if (this.sharedOfflineData.isOfflineShared(profile)) {
          return from(this.sharedOfflineData.read<ServiceIVoucher>(profile, 'vouchers')).pipe(
            switchMap(vouchers => from(this.withOfflineImageUrls(vouchers))),
            map(vouchers => this.applyQueryLocally(vouchers, q)),
          );
        }
        if (this.personalOfflineData.isOfflinePersonal(profile)) {
          return from(this.personalOfflineData.read<ServiceIVoucher>(profile, 'vouchers')).pipe(
            switchMap(vouchers => from(this.withOfflineImageUrls(vouchers))),
            map(vouchers => this.applyQueryLocally(vouchers, q)),
          );
        }
        return this.spaceSwitchLoadingService.track(
          from(this.spaceDataService.getActiveCollectionContext(profile, 'vouchers')),
        ).pipe(
          switchMap(({ canonicalRef, legacyRef }) => {
            const baseRef = canonicalRef || legacyRef;
            const constraints = this.queryConstraints(q);
            const source = constraints.length ? query(baseRef, ...constraints) : baseRef;
            const vouchers$ = objectVal<Record<string, Record<string, unknown>> | null>(source).pipe(
              switchMap(async rawData => {
                const vouchersData = rawData || {};
                // A queried snapshot only replaces the part of the offline
                // cache it covers; other months stay available offline.
                const covers = this.queryCoverage(q, vouchersData);
                if (getActiveGroupId(profile)) await this.sharedOfflineData.cacheRemote(profile, 'vouchers', vouchersData, covers);
                else await this.personalOfflineData.cacheRemote(profile, 'vouchers', vouchersData, covers);
                if (!rawData) return [];

                const userIds = new Set<string>();
                Object.values(vouchersData).forEach((v: any) => {
                  if (v.userId) userIds.add(v.userId);
                  if (v.updatedBy) userIds.add(v.updatedBy);
                });

                // Public mirror (name + photo only) — readable regardless of
                // shared-space state on either side, unlike the full profile.
                const userProfilesArray = await Promise.all(
                  [...userIds].map(async userId => ({ userId, profile: await this.getCachedPublicProfile(userId) })),
                );

                const userProfiles = userProfilesArray.reduce((acc, { userId, profile }) => {
                  if (profile) acc[userId] = profile;
                  return acc;
                }, {} as { [userId: string]: PublicUserProfile });

                return Object.keys(vouchersData)
                  .map(key => {
                    const voucher = vouchersData[key] as unknown as IVoucher;
                    // Prefer the live profile over the snapshot stored at
                    // creation time, so a member's name/photo update reaches
                    // past records — fall back to the snapshot only if the
                    // live lookup found nothing (e.g. former member).
                    const creatorProfile = voucher.userId ? userProfiles[voucher.userId] : undefined;
                    const createdByName = creatorProfile
                      ? (creatorProfile.displayName || 'Former Member')
                      : (voucher.createdByName || 'Former Member');
                    const createdByPhotoURL = creatorProfile
                      ? this.getProfilePhotoURL(creatorProfile)
                      : (voucher.createdByPhotoURL || null);

                    // Last editor: live name first, then the edit-time
                    // snapshot (absent on vouchers edited before it was stored).
                    const editorProfile = voucher.updatedBy ? userProfiles[voucher.updatedBy] : undefined;
                    const updatedByName = editorProfile?.displayName || voucher.updatedByName || undefined;

                    return {
                      id: key,
                      ...voucher,
                      updatedByName,
                      createdByName,
                      createdByPhotoURL,
                      userDisplayName: createdByName,
                      userPhotoURL: createdByPhotoURL,
                    } as ServiceIVoucher;
                  })
                  .sort((a, b) => {
                    const bTime = this.getTimestamp(b.date) || this.getTimestamp(b.createdAt);
                    const aTime = this.getTimestamp(a.date) || this.getTimestamp(a.createdAt);
                    return bTime - aTime;
                  });
              }),
              catchError(error => {
                console.error('Error fetching vouchers:', error);
                return of([]);
              }),
            );

            return this.spaceSwitchLoadingService.track(vouchers$);
          }),
        );
      }),
    );
  }

  async addVoucher(voucherData: AddVoucherInput): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$);
    if (!profile?.uid) throw new Error('User not authenticated.');

    const files = voucherData.files.slice(0, MAX_IMAGES);
    if (files.length === 0) throw new Error('No images provided.');

    for (const file of files) {
      if (!file.type.startsWith('image/')) throw new Error('Only image files can be uploaded.');
      if (file.size > 8 * 1024 * 1024) throw new Error('Voucher image must be 8 MB or smaller.');
    }

    const currentUser = await firstValueFrom(this.authService.currentUser$);

    const offlineShared = this.sharedOfflineData.isOfflineShared(profile);
    const offlinePersonal = this.personalOfflineData.isOfflinePersonal(profile);
    if (offlineShared || offlinePersonal) {
      const compressed = await Promise.all(files.map(f => this.compressImage(f)));
      const voucherId = offlineShared
        ? this.sharedOfflineData.createRecordId('vouchers')
        : this.personalOfflineData.createRecordId('vouchers');
      const fileKeys = compressed.map((_, index) => `voucher:${profile.uid}:${voucherId}:${index}`);
      await Promise.all(compressed.map((file, index) => this.offlineStore.saveBlob(fileKeys[index], file)));
      const imageUrls = compressed.map(file => URL.createObjectURL(file));
      const safeFileName = this.sanitizeFileName(files[0].name);
      const parser = new UAParser();
      const result = parser.getResult();
      const device = `${result.browser.name} on ${result.os.name}, Model: ${result.device.model || 'Unknown'} (${result.device.vendor || 'Unknown'})`;
      const localVoucher: Record<string, unknown> = {
        date: voucherData.date,
        title: voucherData.title?.trim() || safeFileName,
        category: voucherData.category || '',
        note: voucherData.note?.trim() || '',
        imageUrl: imageUrls[0],
        imageUrls,
        imageCount: imageUrls.length,
        storagePath: '',
        storagePaths: [],
        fileName: files[0].name,
        contentType: files[0].type,
        size: files.reduce((sum, file) => sum + file.size, 0),
        userId: profile.uid,
        ...(offlineShared ? { groupId: getActiveGroupId(profile) } : {}),
        createdByName: profile.displayName || 'Anonymous',
        createdByPhotoURL: this.getProfilePhotoURL(profile) || currentUser?.photoURL || null,
        createdAt: new Date().toISOString(),
        device,
        syncStatus: 'pending',
        offlineFileKeys: fileKeys,
      };
      const serverVoucher = { ...localVoucher };
      delete serverVoucher['imageUrl'];
      delete serverVoucher['imageUrls'];
      delete serverVoucher['storagePath'];
      delete serverVoucher['storagePaths'];
      delete serverVoucher['syncStatus'];
      delete serverVoucher['offlineFileKeys'];
      const uploadPayload = {
        voucherId,
        userId: profile.uid,
        cacheScope: offlineShared ? this.sharedOfflineData.cacheScope(profile) : profile.uid,
        fileKeys,
        cloudinaryFolder: offlineShared
          ? `vouchers/spaces/${getActiveGroupId(profile)}`
          : `vouchers/${profile.personalSpaceId ? `spaces/${profile.personalSpaceId}` : `users/${profile.uid}`}`,
        // Local-only display fields must never reach Firebase.
        voucher: serverVoucher,
      };
      if (offlineShared) await this.sharedOfflineData.queueVoucherUpload(profile, voucherId, localVoucher, uploadPayload);
      else await this.personalOfflineData.queueVoucherUpload(profile, voucherId, localVoucher, uploadPayload);
      return;
    }
    const { canonicalRef, legacyRef, spaceId } =
      await this.spaceDataService.getActiveCollectionContext(profile, 'vouchers');
    const vouchersRef = canonicalRef || legacyRef;
    const newVoucherRef = push(vouchersRef);
    const voucherId = newVoucherRef.key;
    if (!voucherId) throw new Error('Could not create voucher record.');

    const activeGroupId = getActiveGroupId(profile);
    const ownerSegment = spaceId
      ? `spaces/${spaceId}`
      : activeGroupId
        ? `groups/${activeGroupId}`
        : `users/${profile.uid}`;
    const cloudinaryFolder = `vouchers/${ownerSegment}`;

    const compressed = await Promise.all(files.map(f => this.compressImage(f)));

    let imageUrls: string[];
    let storagePaths: string[];
    try {
      const results = await Promise.all(
        compressed.map(f => this.uploadToCloudinary(f, cloudinaryFolder)),
      );
      imageUrls = results.map(r => r.url);
      storagePaths = results.map(r => r.publicId);
    } catch (error) {
      // Uploads go straight from the browser to Cloudinary (not Firebase
      // Storage) — log the real cause here since it's swallowed into a
      // generic translated message below (usually a network/connectivity
      // issue reaching api.cloudinary.com, e.g. an ISP or VPN exit node
      // blocking/throttling the request, rather than an app misconfiguration).
      console.error('Voucher image upload to Cloudinary failed:', error);
      throw new Error('VOUCHER_UPLOAD_ERROR');
    }

    const safeFileName = this.sanitizeFileName(files[0].name);
    const parser = new UAParser();
    const result = parser.getResult();
    const device = `${result.browser.name} on ${result.os.name}, Model: ${result.device.model || 'Unknown'} (${result.device.vendor || 'Unknown'})`;
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);

    const newVoucher: Omit<IVoucher, 'id'> = {
      date: voucherData.date,
      title: voucherData.title?.trim() || safeFileName,
      category: voucherData.category || '',
      note: voucherData.note?.trim() || '',
      imageUrl: imageUrls[0],
      imageUrls,
      imageCount: imageUrls.length,
      storagePath: storagePaths[0],
      storagePaths,
      fileName: files[0].name,
      contentType: files[0].type,
      size: totalSize,
      userId: profile.uid,
      createdByName: profile.displayName || 'Anonymous',
      createdByPhotoURL: this.getProfilePhotoURL(profile) || currentUser?.photoURL || null,
      createdAt: new Date().toISOString(),
      device,
    };

    if (activeGroupId) newVoucher.groupId = activeGroupId;

    await set(newVoucherRef, newVoucher);
  }

  /** The voucher's current images paired with their Cloudinary ids. */
  getVoucherImageRefs(voucher: ServiceIVoucher): VoucherImageRef[] {
    const urls = voucher.imageUrls?.length ? voucher.imageUrls : voucher.imageUrl ? [voucher.imageUrl] : [];
    const ids = voucher.storagePaths?.length ? voucher.storagePaths : voucher.storagePath ? [voucher.storagePath] : [];
    return urls.map((url, index) => ({ url, publicId: ids[index] || '' }));
  }

  async updateVoucher(voucher: ServiceIVoucher, input: UpdateVoucherInput): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$);
    if (!profile?.uid) throw new Error('User not authenticated.');
    if (!voucher.id) throw new Error('Voucher ID is required.');

    const original = this.getVoucherImageRefs(voucher);
    const newFiles = input.newFiles.slice(0, Math.max(0, MAX_IMAGES - input.keptImages.length));
    if (input.keptImages.length + newFiles.length === 0) throw new Error('VOUCHER_ERROR_SELECT_IMAGE');
    for (const file of newFiles) {
      if (!file.type.startsWith('image/')) throw new Error('VOUCHER_ERROR_FILE_TYPE');
      if (file.size > 8 * 1024 * 1024) throw new Error('VOUCHER_ERROR_FILE_SIZE');
    }

    const keptUrls = new Set(input.keptImages.map(img => img.url));
    const removed = original.filter(img => !keptUrls.has(img.url));
    const imagesChanged = newFiles.length > 0 || removed.length > 0;

    const parser = new UAParser();
    const result = parser.getResult();
    const editedDevice = `${result.browser.name} on ${result.os.name}, Model: ${result.device.model || 'Unknown'} (${result.device.vendor || 'Unknown'})`;
    const metadata: Record<string, unknown> = {
      date: input.date,
      title: input.title?.trim() || voucher.title || voucher.fileName,
      category: input.category || '',
      note: input.note?.trim() || '',
      updatedAt: new Date().toISOString(),
      updatedBy: profile.uid,
      // Snapshot of the editor's name so it shows offline and after they leave.
      updatedByName: profile.displayName || 'Anonymous',
      updatedFields: [
        ...changedFields(voucher as unknown as Record<string, unknown>, {
          date: input.date,
          title: input.title?.trim() || voucher.title || voucher.fileName,
          category: input.category || '',
          note: input.note?.trim() || '',
        }, ['date', 'title', 'category', 'note']),
        ...(imagesChanged ? ['images'] : []),
      ],
      editedDevice,
    };

    const offlineShared = this.sharedOfflineData.isOfflineShared(profile);
    const offlinePersonal = this.personalOfflineData.isOfflinePersonal(profile);
    // Image changes need Cloudinary; offline (or still-queued) vouchers only
    // get text edits so a queued upload's file keys never go out of step.
    if (imagesChanged && (offlineShared || offlinePersonal || voucher.syncStatus === 'pending')) {
      throw new Error('VOUCHER_ERROR_EDIT_IMAGES_OFFLINE');
    }
    if (offlineShared || offlinePersonal) {
      if (offlinePersonal) {
        await this.personalOfflineData.write(profile, 'vouchers', 'update', voucher.id, metadata);
        return;
      }
      if (offlineShared) {
        const records = await this.sharedOfflineData.read<ServiceIVoucher>(profile, 'vouchers');
        const current = records[voucher.id];
        await this.sharedOfflineData.write(
          profile, 'vouchers', 'update', voucher.id, metadata,
          (current as any)?.updatedAt || current?.createdAt || null,
        );
        return;
      }
    }

    const activeGroupId = getActiveGroupId(profile);
    const currentSpaceId = this.spaceDataService.getCurrentSpaceId(profile);
    const { canonicalRef, spaceId } = await this.spaceDataService.getActiveCollectionContext(profile, 'vouchers');
    const voucherRef = canonicalRef && currentSpaceId
      ? dbRef(this.db, `space_data/${currentSpaceId}/vouchers/${voucher.id}`)
      : activeGroupId
        ? dbRef(this.db, `group_data/${activeGroupId}/vouchers/${voucher.id}`)
        : dbRef(this.db, `users/${profile.uid}/vouchers/${voucher.id}`);

    if (!imagesChanged) {
      await update(voucherRef, metadata);
      return;
    }

    const ownerSegment = spaceId
      ? `spaces/${spaceId}`
      : activeGroupId
        ? `groups/${activeGroupId}`
        : `users/${profile.uid}`;
    const compressed = await Promise.all(newFiles.map(f => this.compressImage(f)));
    let uploaded: { url: string; publicId: string }[];
    try {
      uploaded = await Promise.all(compressed.map(f => this.uploadToCloudinary(f, `vouchers/${ownerSegment}`)));
    } catch (error) {
      console.error('Voucher image upload to Cloudinary failed:', error);
      throw new Error('VOUCHER_UPLOAD_ERROR');
    }

    const images = [...input.keptImages, ...uploaded];
    // Per-image sizes aren't stored, so estimate the kept share of the old total.
    const keptSize = original.length
      ? Math.round((voucher.size || 0) * (input.keptImages.length / original.length))
      : 0;
    const imagePayload: Record<string, unknown> = {
      imageUrl: images[0].url,
      imageUrls: images.map(img => img.url),
      imageCount: images.length,
      storagePath: images[0].publicId,
      storagePaths: images.map(img => img.publicId),
      size: keptSize + compressed.reduce((sum, f) => sum + f.size, 0),
    };

    try {
      await update(voucherRef, { ...metadata, ...imagePayload });
    } catch (error) {
      void this.imageUploadService.deleteImages(uploaded.map(img => img.publicId));
      throw error;
    }

    // Free removed images only after the record no longer points at them.
    if (removed.length) void this.imageUploadService.deleteImages(removed.map(img => img.publicId));
  }

  private async withOfflineImageUrls(
    records: Record<string, ServiceIVoucher>,
  ): Promise<ServiceIVoucher[]> {
    const vouchers = await Promise.all(Object.entries(records).map(async ([id, voucher]) => {
      if (!voucher.offlineFileKeys?.length) return { ...voucher, id } as ServiceIVoucher;
      const blobs = await Promise.all(voucher.offlineFileKeys.map(key => this.offlineStore.getBlob(key)));
      const imageUrls = blobs.filter((blob): blob is Blob => !!blob).map(blob => URL.createObjectURL(blob));
      return {
        ...voucher,
        id,
        imageUrl: imageUrls[0] || voucher.imageUrl,
        imageUrls: imageUrls.length ? imageUrls : voucher.imageUrls,
        imageCount: imageUrls.length || voucher.imageCount,
      } as ServiceIVoucher;
    }));
    return vouchers.sort((a, b) => this.getTimestamp(b.date) - this.getTimestamp(a.date));
  }

  async deleteVoucher(voucher: ServiceIVoucher): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$);
    if (!profile?.uid) throw new Error('User not authenticated.');

    if (this.personalOfflineData.isOfflinePersonal(profile)) {
      await this.personalOfflineData.write(profile, 'vouchers', 'remove', voucher.id!);
      return;
    }
    if (this.sharedOfflineData.isOfflineShared(profile)) {
      const records = await this.sharedOfflineData.read<ServiceIVoucher>(profile, 'vouchers');
      const current = records[voucher.id!];
      await this.sharedOfflineData.write(
        profile,
        'vouchers',
        'remove',
        voucher.id!,
        undefined,
        (current as any)?.updatedAt || current?.createdAt || null,
      );
      return;
    }

    const activeGroupId = getActiveGroupId(profile);
    const currentSpaceId = this.spaceDataService.getCurrentSpaceId(profile);
    const { canonicalRef } = await this.spaceDataService.getActiveCollectionContext(profile, 'vouchers');
    const voucherRef = canonicalRef && currentSpaceId
      ? dbRef(this.db, `space_data/${currentSpaceId}/vouchers/${voucher.id}`)
      : activeGroupId
        ? dbRef(this.db, `group_data/${activeGroupId}/vouchers/${voucher.id}`)
        : dbRef(this.db, `users/${profile.uid}/vouchers/${voucher.id}`);

    await remove(voucherRef);

    // Permanently free the Cloudinary storage too — best-effort, after the
    // record is gone (a cleanup failure must not resurrect the voucher).
    const publicIds = voucher.storagePaths?.length
      ? voucher.storagePaths
      : [voucher.storagePath];
    void this.imageUploadService.deleteImages(publicIds);
  }
}
