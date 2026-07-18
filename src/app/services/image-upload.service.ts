import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * Shared client-side resize + Cloudinary unsigned upload, so each feature
 * (space photos, category icons, …) doesn't re-implement its own copy.
 */
@Injectable({ providedIn: 'root' })
export class ImageUploadService {
  private http = inject(HttpClient);

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
}
