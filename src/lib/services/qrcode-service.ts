import { QRCodeData, QRCodeOptions, GeneratedQRCode } from '@shared/types/qrcode';

export class QRCodeService {
  /**
   * Generate QR code data from transaction details
   * Uses a simple deterministic pattern for client-side generation
   */
  generateQRData(data: QRCodeData, options: QRCodeOptions = {}): string {
    const json = JSON.stringify({
      txId: data.transactionId,
      amount: data.amount,
      currency: data.currency,
      timestamp: data.timestamp,
      status: data.status,
    });

    // Return base64 encoded JSON for QR scanning
    return Buffer.from(json).toString('base64');
  }

  /**
   * Create a simple SVG QR-like pattern (decorative)
   * For production, integrate with a real QR library like qrcode.js
   */
  generateSVGPattern(data: string, size: number = 200): string {
    const cellSize = size / 21; // Standard QR is 21x21 modules
    const cells: boolean[] = [];

    // Generate deterministic pattern from data
    for (let i = 0; i < 441; i++) {
      const charCode = data.charCodeAt(i % data.length);
      cells.push((charCode + i) % 3 !== 0);
    }

    // Fixed corner finder patterns (QR standard)
    const corners = new Set([
      0, 1, 2, 3, 4, 5, 6, 9, 15, 18, 24, 27, 33, 36, 42, 45, 46, 47, 48, 49, 50, 51, 54, 60, 63,
      69, 72, 73, 74, 75, 76, 77, 78,
    ]);

    let svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">`;
    svg += `<rect width="${size}" height="${size}" fill="white"/>`;

    for (let i = 0; i < cells.length; i++) {
      if (cells[i] || corners.has(i)) {
        const row = Math.floor(i / 21);
        const col = i % 21;
        const x = col * cellSize;
        const y = row * cellSize;
        svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="black"/>`;
      }
    }

    svg += '</svg>';
    return svg;
  }

  /**
   * Create a QR code record
   */
  async createQRCode(
    transactionId: string,
    data: QRCodeData,
    options: QRCodeOptions = {},
  ): Promise<GeneratedQRCode> {
    const id = `qr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const qrData = this.generateQRData(data, options);

    const qrCode: GeneratedQRCode = {
      id,
      transactionId,
      qrData,
      format: 'dataurl',
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
    };

    // TODO: Persist to database
    return qrCode;
  }

  /**
   * Get QR code by transaction ID
   */
  async getQRCode(transactionId: string): Promise<GeneratedQRCode | null> {
    // TODO: Fetch from database
    return null;
  }

  /**
   * Generate downloadable QR code
   */
  generateDownloadableQR(
    data: QRCodeData,
    format: 'svg' | 'png' = 'svg',
    size: number = 200,
  ): string {
    if (format === 'svg') {
      const qrData = this.generateQRData(data);
      return this.generateSVGPattern(qrData, size);
    }

    // For PNG, would need canvas library
    // This is a placeholder
    return '';
  }

  /**
   * Parse QR code data
   */
  parseQRData(qrData: string): QRCodeData | null {
    try {
      const json = Buffer.from(qrData, 'base64').toString('utf-8');
      const parsed = JSON.parse(json);
      return {
        transactionId: parsed.txId,
        amount: parsed.amount,
        currency: parsed.currency,
        timestamp: parsed.timestamp,
        status: parsed.status,
      };
    } catch {
      return null;
    }
  }
}
