'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function SettingsError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('Settings error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full space-y-8 text-center">
        <div>
          <h1 className="text-4xl font-bold text-foreground">Settings Error</h1>
          <p className="mt-4 text-sm text-muted-foreground">
            Unable to load settings at this time.
          </p>
          {error.message && (
            <p className="mt-2 text-xs text-muted-foreground break-words">
              {error.message}
            </p>
          )}
        </div>
        <div className="flex gap-3 justify-center">
          <Button onClick={reset} variant="default">
            Try again
          </Button>
          <Link href="/">
            <Button variant="outline">
              Go home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
