export interface ShareableTransaction {
  id: string;
  transactionId: string;
  shareToken: string;
  userAddress: string;
  isPublic: boolean;
  createdAt: number;
  expiresAt?: number;
  viewCount: number;
}

export interface SharePreview {
  transactionId: string;
  amount: string;
  currency: string;
  status: string;
  timestamp: number;
}

export interface ShareSettings {
  allowSharing: boolean;
  shareableFields: string[];
  expirationDays?: number;
}

export type SharePlatform = 'twitter' | 'facebook' | 'linkedin' | 'email' | 'copy';
