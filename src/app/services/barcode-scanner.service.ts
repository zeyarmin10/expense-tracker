import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';

/**
 * Thin wrapper around @capacitor-mlkit/barcode-scanning — native-only (no
 * web fallback, per the product decision behind the POS feature this backs).
 * Kept UI-agnostic like the other services: it returns a value or throws a
 * plain Error, and the calling component decides how to show that to the
 * user (same convention as ProductService/getProductErrorMessage()).
 */
@Injectable({
  providedIn: 'root',
})
export class BarcodeScannerService {
  isSupported(): boolean {
    return Capacitor.isNativePlatform();
  }

  /**
   * Opens the native full-screen scanner and resolves with the first
   * decoded barcode's value, or null if the user cancelled without a scan.
   * Throws 'Camera permission denied.' or 'Barcode scanning not supported.'
   * for the caller to map to a translated toast.
   */
  async scan(): Promise<string | null> {
    if (!this.isSupported()) {
      throw new Error('Barcode scanning not supported.');
    }

    const permissionStatus = await BarcodeScanner.checkPermissions();
    if (permissionStatus.camera !== 'granted' && permissionStatus.camera !== 'limited') {
      const requested = await BarcodeScanner.requestPermissions();
      if (requested.camera !== 'granted' && requested.camera !== 'limited') {
        throw new Error('Camera permission denied.');
      }
    }

    // Android's ML Kit scanner module is downloaded on demand — installing
    // it up front (a no-op if already present) avoids the first scan of a
    // session failing on a device that's never used it before.
    if (Capacitor.getPlatform() === 'android') {
      const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
      if (!available) {
        await BarcodeScanner.installGoogleBarcodeScannerModule();
      }
    }

    try {
      const { barcodes } = await BarcodeScanner.scan();
      return barcodes.length > 0 ? (barcodes[0].rawValue ?? barcodes[0].displayValue) : null;
    } catch (error: any) {
      // The native scanner (both Android and iOS) rejects with this exact
      // message when the user closes the scanner without scanning anything
      // — not a real error, just the cancel path modeled as a throw.
      if (typeof error?.message === 'string' && error.message.toLowerCase().includes('scan canceled')) {
        return null;
      }
      throw error;
    }
  }
}
