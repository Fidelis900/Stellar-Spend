import { NextResponse, type NextRequest } from 'next/server';
import { ErrorHandler } from '@/lib/error-handler';

interface SyncSettingsRecord {
  wallet: string;
  syncEnabled: boolean;
  conflictResolutionStrategy: 'last-write-wins';
  updatedAt: number;
}

// In-memory store for demonstration; in production, this would be a database table
// CREATE TABLE sync_settings (
//   id SERIAL PRIMARY KEY,
//   wallet VARCHAR(255) UNIQUE NOT NULL,
//   sync_enabled BOOLEAN NOT NULL DEFAULT false,
//   conflict_resolution_strategy VARCHAR(50) NOT NULL DEFAULT 'last-write-wins',
//   updated_at BIGINT NOT NULL,
//   created_at BIGINT NOT NULL
// );
const syncSettingsStore = new Map<string, SyncSettingsRecord>();

/**
 * GET /api/v1/sync/settings
 * Fetch sync settings for authenticated user
 */
export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get('wallet');

  if (!wallet) {
    return ErrorHandler.validation('wallet address is required');
  }

  try {
    // TODO: Add authentication check to ensure user owns this wallet

    const normalizedWallet = wallet.toLowerCase();
    const settings = syncSettingsStore.get(normalizedWallet) || {
      wallet: normalizedWallet,
      syncEnabled: false, // Default to disabled for privacy
      conflictResolutionStrategy: 'last-write-wins' as const,
      updatedAt: Date.now(),
    };

    return NextResponse.json(
      {
        success: true,
        settings,
        timestamp: Date.now(),
      },
      { status: 200 },
    );
  } catch (err) {
    return ErrorHandler.serverError(err);
  }
}

/**
 * POST /api/v1/sync/settings
 * Update sync settings for authenticated user
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return ErrorHandler.validation('Invalid JSON body');
  }

  const wallet = body.wallet as string | undefined;
  const syncEnabled = body.syncEnabled as boolean | undefined;

  if (!wallet) {
    return ErrorHandler.validation('wallet address is required');
  }

  if (syncEnabled === undefined) {
    return ErrorHandler.validation('syncEnabled is required');
  }

  try {
    // TODO: Add authentication check to ensure user owns this wallet

    const normalizedWallet = wallet.toLowerCase();
    const settings: SyncSettingsRecord = {
      wallet: normalizedWallet,
      syncEnabled,
      conflictResolutionStrategy: 'last-write-wins',
      updatedAt: Date.now(),
    };

    syncSettingsStore.set(normalizedWallet, settings);

    return NextResponse.json(
      {
        success: true,
        settings,
        timestamp: Date.now(),
      },
      { status: 200 },
    );
  } catch (err) {
    return ErrorHandler.serverError(err);
  }
}
