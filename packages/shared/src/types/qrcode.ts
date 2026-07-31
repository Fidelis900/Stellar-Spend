export interface QRCodeData {
  transactionId: string;
  amount: string;
  currency: string;
  timestamp: number;
  status: string;
  bankName?: string;
}

export interface QRCodeOptions {
  size?: number;
  errorCorrection?: 'L' | 'M' | 'Q' | 'H';
  includeTransactionDetails?: boolean;
}

export interface GeneratedQRCode {
  id: string;
  transactionId: string;
  qrData: string;
  format: 'svg' | 'png' | 'dataurl';
  createdAt: number;
  expiresAt?: number;
}
