import { Skeleton } from './Skeleton';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  isLoading?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  isLoading = false,
  disabled = false,
  placeholder = 'Select…',
}: SelectFieldProps) {
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
          position: 'relative',
        }}
      >
        {isLoading ? (
          <Skeleton width="100%" height={16} aria-label={`Loading ${label.toLowerCase()}…`} />
        ) : (
          <>
            <select
              value={value}
              onChange={(e) => onChange(e.target.value)}
              disabled={disabled || options.length === 0}
              style={{
                flex: 1,
                background: 'none',
                border: 0,
                outline: 'none',
                color: value ? 'var(--text)' : 'var(--muted)',
                font: 'inherit',
                fontSize: 14,
                appearance: 'none',
                cursor: 'pointer',
                opacity: disabled ? 0.5 : 1,
              }}
            >
              {!value && <option value="">{placeholder}</option>}
              {options.map((o) => (
                <option key={o.value} value={o.value} style={{ background: 'var(--panel)' }}>
                  {o.label}
                </option>
              ))}
            </select>
            {/* chevron */}
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              style={{ pointerEvents: 'none', flexShrink: 0 }}
              aria-hidden="true"
            >
              <path
                d="M2 4l4 4 4-4"
                stroke="var(--muted)"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </>
        )}
      </div>
    </div>
  );
}
