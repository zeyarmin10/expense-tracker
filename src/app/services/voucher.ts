import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  Database,
  get,
  push,
  ref as dbRef,
  remove,
  set,
} from '@angular/fire/database';
import { Observable, firstValueFrom, from, of } from 'rxjs';
import { catchError, filter, switchMap } from 'rxjs/operators';
import { UAParser } from 'ua-parser-js';
import { DataIVoucher as IVoucher } from '../core/models/data';
import { AuthService } from './auth';
import { SpaceDataService } from './space-data.service';
import { SpaceSwitchLoadingService } from './space-switch-loading.service';
import { UserDataService, UserProfile, PublicUserProfile, getActiveGroupId } from './user-data';
import { environment } from '../../environments/environment';

export type ServiceIVoucher = IVoucher & {
  id: string;
  createdByName?: string;
  createdByPhotoURL?: string | null;
  userDisplayName?: string;
  userPhotoURL?: string | null;
};

export interface AddVoucherInput {
  date: string;
  title?: string;
  category?: string;
  note?: string;
  files: File[];
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

  getVouchers(profileOverride?: UserProfile): Observable<ServiceIVoucher[]> {
    const profile$ = profileOverride
      ? of(profileOverride)
      : this.authService.userProfile$.pipe(
          filter((profile): profile is UserProfile => profile !== null),
        );

    return profile$.pipe(
      switchMap(profile =>
        this.spaceSwitchLoadingService.track(
          from(this.spaceDataService.getActiveCollectionContext(profile, 'vouchers')),
        ).pipe(
          switchMap(({ canonicalRef, legacyRef }) => {
            const baseRef = canonicalRef || legacyRef;
            const vouchers$ = from(get(baseRef)).pipe(
              switchMap(async snapshot => {
                const vouchersData = snapshot.val();
                if (!vouchersData) return [];

                const userIds = new Set<string>();
                Object.values(vouchersData).forEach((v: any) => {
                  if (v.userId) userIds.add(v.userId);
                });

                // Public mirror (name + photo only) — readable regardless of
                // shared-space state on either side, unlike the full profile.
                const userProfilesArray = await Promise.all(
                  [...userIds].map(async userId => {
                    try {
                      const profile = await firstValueFrom(this.userDataService.getPublicProfile(userId));
                      return { userId, profile };
                    } catch {
                      return { userId, profile: null };
                    }
                  }),
                );

                const userProfiles = userProfilesArray.reduce((acc, { userId, profile }) => {
                  if (profile) acc[userId] = profile;
                  return acc;
                }, {} as { [userId: string]: PublicUserProfile });

                return Object.keys(vouchersData)
                  .map(key => {
                    const voucher = vouchersData[key] as IVoucher;
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

                    return {
                      id: key,
                      ...voucher,
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
        ),
      ),
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
    } catch {
      throw new Error('VOUCHER_STORAGE_SETUP_ERROR');
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

  async deleteVoucher(voucher: ServiceIVoucher): Promise<void> {
    const profile = await firstValueFrom(this.authService.userProfile$);
    if (!profile?.uid) throw new Error('User not authenticated.');

    const activeGroupId = getActiveGroupId(profile);
    const currentSpaceId = this.spaceDataService.getCurrentSpaceId(profile);
    const { canonicalRef } = await this.spaceDataService.getActiveCollectionContext(profile, 'vouchers');
    const voucherRef = canonicalRef && currentSpaceId
      ? dbRef(this.db, `space_data/${currentSpaceId}/vouchers/${voucher.id}`)
      : activeGroupId
        ? dbRef(this.db, `group_data/${activeGroupId}/vouchers/${voucher.id}`)
        : dbRef(this.db, `users/${profile.uid}/vouchers/${voucher.id}`);

    await remove(voucherRef);
  }
}
