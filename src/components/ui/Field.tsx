import { Skeleton } from './Skeleton';

interface FieldProps {
  label: string;
  value?: string;
  tone?: 'muted' | 'accent';
  isLoading?: boolean;
  loadingLabel?: string;
}

/** Read-only display field. Shows a skeleton while loading. */
export function Field({
  label,
  value,
  tone = 'muted',
  isLoading = false,
  loadingLabel,
}: FieldProps) {
  const color = tone === 'accent' ? 'var(--accent)' : 'var(--muted)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.08em' }}>
        {label}
      </label>
      <div
        style={{
          height: 46,
          border: '1px solid var(--line)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
        }}
      >
        {isLoading ? (
          <Skeleton
            width={140}
            height={14}
            aria-label={loadingLabel ?? `Loading ${label.toLowerCase()}…`}
          />
        ) : (
          <span style={{ fontSize: 14, color, font: 'inherit' }}>{value ?? '—'}</span>
        )}
      </div>
    </div>
  );
}
