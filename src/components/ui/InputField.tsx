import { Skeleton } from './Skeleton';

interface InputFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  min?: string;
  step?: string;
  placeholder?: string;
  suffix?: React.ReactNode;
  isLoadingSuffix?: boolean;
  disabled?: boolean;
}

export function InputField({
  label,
  value,
  onChange,
  type = 'text',
  min,
  step,
  placeholder,
  suffix,
  isLoadingSuffix = false,
  disabled = false,
}: InputFieldProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.08em' }}>
        {label}
      </label>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 46,
          border: '1px solid var(--line)',
          padding: '0 12px',
          gap: 8,
        }}
      >
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min={min}
          step={step}
          placeholder={placeholder}
          disabled={disabled}
          style={{
            flex: 1,
            background: 'none',
            border: 0,
            outline: 'none',
            color: 'var(--text)',
            font: 'inherit',
            fontSize: 14,
            opacity: disabled ? 0.5 : 1,
          }}
        />
        {isLoadingSuffix ? (
          <Skeleton width={72} height={14} aria-label="Loading quote…" />
        ) : suffix ? (
          <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
            {suffix}
          </span>
        ) : null}
      </div>
    </div>
  );
}
