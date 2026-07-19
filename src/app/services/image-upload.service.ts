import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Auth } from '@angular/fire/auth';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * Shared client-side resize + Cloudinary unsigned upload, so each feature
 * (space photos, category icons, …) doesn't re-implement its own copy.
 */
@Injectable({ providedIn: 'root' })
export class ImageUploadService {
  private http = inject(HttpClient);
  private auth = inject(Auth);

  /**
   * Downscales the image so its longest edge is `maxSize` px and re-encodes
   * as JPEG. Falls back to the original file if decoding fails.
   */
  compressImage(file: File, maxSize = 400): Promise<File> {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => resolve(new File([blob!], file.name, { type: 'image/jpeg' })),
          'image/jpeg',
          0.85,
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(file);
      };
      img.src = url;
    });
  }

  /** Uploads to Cloudinary (unsigned preset) and returns the secure URL. */
  async upload(file: File, folder: string): Promise<string> {
    const { cloudName, uploadPreset } = environment.cloudinary;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', uploadPreset);
    formData.append('folder', folder);
    const response = await firstValueFrom(
      this.http.post<{ secure_url: string }>(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        formData,
      ),
    );
    return response.secure_url;
  }

  /** Convenience: compress then upload. */
  async compressAndUpload(file: File, folder: string, maxSize = 400): Promise<string> {
    const compressed = await this.compressImage(file, maxSize);
    return this.upload(compressed, folder);
  }

  /**
   * Extracts the Cloudinary public_id from a delivery URL, e.g.
   * https://res.cloudinary.com/<cloud>/image/upload/v123/profiles/u1/a.jpg
   * → "profiles/u1/a". Returns null for non-Cloudinary URLs (Google account
   * photos etc.), so callers can pass any stored photo URL safely.
   */
  publicIdFromUrl(url: string | null | undefined): string | null {
    if (!url || !url.includes('res.cloudinary.com')) return null;
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-zA-Z0-9]+)?(?:[?#].*)?$/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  /**
   * Best-effort permanent deletion from Cloudinary via the authenticated
   * backend endpoint. Never throws — the app record is already gone by the
   * time this runs, so a cleanup failure must not break the user flow; it
   * only means the asset lingers in storage.
   */
  async deleteImages(publicIds: (string | null | undefined)[]): Promise<void> {
    const ids = [...new Set(publicIds.filter((id): id is string => !!id?.trim()))];
    if (ids.length === 0) return;

    try {
      const idToken = await this.auth.currentUser?.getIdToken();
      if (!idToken) return;
      const baseUrl = (environment as { apiBaseUrl?: string }).apiBaseUrl || '';
      await firstValueFrom(
        this.http.post(`${baseUrl}/api/delete-images`, { publicIds: ids }, {
          headers: { Authorization: `Bearer ${idToken}` },
        }),
      );
    } catch (error) {
      console.warn('Cloudinary cleanup failed (asset left in storage):', error);
    }
  }
}
