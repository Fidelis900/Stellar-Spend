/**
 * KYC E2E fixtures — Issue #832
 *
 * Provides deterministic mock data for KYC Playwright tests.
 * All identifiers are fake and safe for use in automated tests.
 */

export const KYC_USERS = {
  /** Fresh user: no KYC started yet */
  unverified: {
    walletAddress: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    userId: 'kyc_test_unverified_001',
    displayName: 'Alice Tester',
  },
  /** User whose KYC is currently under review */
  pending: {
    walletAddress: 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZQ6O9CXJVKF7YIODIXQR',
    userId: 'kyc_test_pending_002',
    displayName: 'Bob Pending',
  },
  /** User whose KYC was rejected */
  rejected: {
    walletAddress: 'GDVXG2FMFFSUMMMBIUEMWPZAIU2FNCH7QNGJMWRXRD6PRDHA7QJIJ7U',
    userId: 'kyc_test_rejected_003',
    displayName: 'Carol Rejected',
  },
} as const;

export const KYC_DOCUMENTS = {
  passport: {
    documentType: 'passport',
    documentId: 'PP-TEST-9876543',
    fileName: 'passport_scan.jpg',
    mimeType: 'image/jpeg',
  },
  license: {
    documentType: 'license',
    documentId: 'DL-TEST-1234567',
    fileName: 'license_front.png',
    mimeType: 'image/png',
  },
  nationalId: {
    documentType: 'id',
    documentId: 'NIN-TEST-5551234',
    fileName: 'national_id.jpg',
    mimeType: 'image/jpeg',
  },
} as const;

/** Structured rejection reasons matching real API payload shape */
export const KYC_REJECTION_REASONS = {
  documentUnreadable: {
    reason: 'Document unreadable',
    code: 'doc_unreadable',
    description:
      'The uploaded document image is too blurry or low-resolution to verify. ' +
      'Please upload a clear, high-quality photo.',
  },
  addressMismatch: {
    reason: 'Address mismatch',
    code: 'address_mismatch',
    description:
      'The address on your document does not match our records. ' +
      'Please provide a document with your current address.',
  },
  expiredDocument: {
    reason: 'Document expired',
    code: 'doc_expired',
    description:
      'The document you submitted has expired. Please provide a valid, ' +
      'in-date identity document.',
  },
  nameMismatch: {
    reason: 'Name mismatch',
    code: 'name_mismatch',
    description: 'The name on your document does not match the name on your account.',
  },
} as const;

/** API response shapes for the KYC route — used in page.route() mocks */
export const KYC_API_RESPONSES = {
  getUnverified: {
    kyc: null,
  },

  getPending: {
    kyc: {
      userId: KYC_USERS.pending.userId,
      status: 'pending',
      documentType: 'passport',
      documentId: 'PP-TEST-9876543',
      submittedAt: Date.now() - 3600_000,
    },
  },

  getRejected: (reason: keyof typeof KYC_REJECTION_REASONS) => ({
    kyc: {
      userId: KYC_USERS.rejected.userId,
      status: 'rejected',
      documentType: 'passport',
      documentId: 'PP-TEST-0000001',
      submittedAt: Date.now() - 86_400_000,
      rejectionReason: KYC_REJECTION_REASONS[reason].reason,
    },
  }),

  submitSuccess: {
    success: true,
    kyc: {
      userId: KYC_USERS.unverified.userId,
      status: 'pending',
      documentType: 'passport',
      documentId: 'PP-TEST-9876543',
      submittedAt: Date.now(),
    },
  },

  rejectKyc: (reason: keyof typeof KYC_REJECTION_REASONS) => ({
    success: true,
    kyc: {
      userId: KYC_USERS.rejected.userId,
      status: 'rejected',
      documentType: 'passport',
      documentId: 'PP-TEST-9876543',
      submittedAt: Date.now() - 3600_000,
      rejectionReason: KYC_REJECTION_REASONS[reason].reason,
    },
  }),

  resubmitSuccess: {
    success: true,
    kyc: {
      userId: KYC_USERS.rejected.userId,
      status: 'pending',
      documentType: 'license',
      documentId: 'DL-TEST-1234567',
      submittedAt: Date.now(),
    },
  },

  verifySuccess: {
    success: true,
    kyc: {
      userId: KYC_USERS.pending.userId,
      status: 'verified',
      documentType: 'passport',
      documentId: 'PP-TEST-9876543',
      submittedAt: Date.now() - 3600_000,
      verifiedAt: Date.now(),
    },
  },
} as const;

export const KYC_UI_LABELS = {
  submitButton: /submit kyc/i,
  resubmitButton: /resubmit|try again|update document/i,
  statusPending: /pending|under review/i,
  statusRejected: /rejected|not approved/i,
  statusApproved: /approved|verified/i,
  rejectionBanner: /rejected|your kyc was not approved/i,
  startKycButton: /start kyc|verify identity|begin verification/i,
  documentTypeSelect: /document type/i,
  documentIdInput: /document (id|number)/i,
} as const;
