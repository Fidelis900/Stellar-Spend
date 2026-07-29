'use client';

import { useState, useCallback } from 'react';
import {
  validateBankField,
  type BankFieldType,
  type ValidationResult,
} from '@/lib/bank-validation';

interface BankFieldProps {
  type: BankFieldType;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}

const DEFAULTS: Record<BankFieldType, { label: string; placeholder: string; maxLength: number }> = {
  account: { label: 'Account Number', placeholder: 'e.g. 0123456789', maxLength: 20 },
  routing: { label: 'Routing Number (ABA)', placeholder: '9-digit ABA number', maxLength: 9 },
  iban: { label: 'IBAN', placeholder: 'e.g. GB29NWBK60161331926819', maxLength: 34 },
};

export function BankField({ type, value, onChange, label, placeholder, disabled }: BankFieldProps) {
  const [touched, setTouched] = useState(false);
  const [result, setResult] = useState<ValidationResult>({ valid: true });

  const defaults = DEFAULTS[type];

  const handleChange = useCallback(
    (raw: string) => {
      onChange(raw);
      if (touched) setResult(validateBankField(type, raw));
    },
    [type, touched, onChange],
  );

  const handleBlur = useCallback(() => {
    setTouched(true);
    setResult(validateBankField(type, value));
  }, [type, value]);

  const showError = touched && !result.valid;
  const showSuccess = touched && result.valid && value.trim().length > 0;

  const borderColor = showError ? '#ef4444' : showSuccess ? '#22c55e' : 'var(--line)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label
        htmlFor={`bank-field-${type}`}
        style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.08em' }}
      >
        {label ?? defaults.label}
      </label>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 46,
          border: '1px solid',
          borderColor,
          padding: '0 12px',
          gap: 8,
          transition: 'border-color 0.15s',
        }}
      >
        <input
          id={`bank-field-${type}`}
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          placeholder={placeholder ?? defaults.placeholder}
          maxLength={defaults.maxLength}
          disabled={disabled}
          aria-invalid={showError}
          aria-describedby={showError ? `bank-field-${type}-error` : undefined}
          style={{
            flex: 1,
            background: 'none',
            border: 0,
            outline: 'none',
            color: 'var(--text)',
            font: 'inherit',
            fontSize: 14,
            opacity: disabled ? 0.5 : 1,
            fontFamily: 'var(--font-ibm-plex-mono)',
            letterSpacing: '0.04em',
          }}
        />
        {showSuccess && (
          <span style={{ color: '#22c55e', fontSize: 14, flexShrink: 0 }} aria-hidden>
            ✓
          </span>
        )}
        {showError && (
          <span style={{ color: '#ef4444', fontSize: 14, flexShrink: 0 }} aria-hidden>
            ✕
          </span>
        )}
      </div>

      {showError && (
        <p
          id={`bank-field-${type}-error`}
          role="alert"
          style={{ fontSize: 11, color: '#ef4444', margin: 0 }}
        >
          {result.error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composite component: full bank account form with mode switching
// ---------------------------------------------------------------------------

export type BankMode = 'local' | 'us' | 'iban';

interface BankAccountInputProps {
  mode: BankMode;
  onModeChange: (m: BankMode) => void;
  accountNumber: string;
  onAccountNumberChange: (v: string) => void;
  routingNumber?: string;
  onRoutingNumberChange?: (v: string) => void;
  iban?: string;
  onIbanChange?: (v: string) => void;
  disabled?: boolean;
}

const MODE_LABELS: Record<BankMode, string> = {
  local: 'Local',
  us: 'US (ABA)',
  iban: 'IBAN',
};

export function BankAccountInput({
  mode,
  onModeChange,
  accountNumber,
  onAccountNumberChange,
  routingNumber = '',
  onRoutingNumberChange,
  iban = '',
  onIbanChange,
  disabled,
}: BankAccountInputProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Mode tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--line)' }}>
        {(['local', 'us', 'iban'] as BankMode[]).map((m) => (
          <button
            key={m}
            onClick={() => onModeChange(m)}
            style={{
              fontSize: 11,
              padding: '6px 14px',
              border: 'none',
              borderBottom: mode === m ? '2px solid var(--accent)' : '2px solid transparent',
              color: mode === m ? 'var(--accent)' : 'var(--muted)',
              background: 'none',
              cursor: 'pointer',
              marginBottom: -1,
              letterSpacing: '0.06em',
            }}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      {/* Fields */}
      {mode === 'local' && (
        <BankField
          type="account"
          value={accountNumber}
          onChange={onAccountNumberChange}
          disabled={disabled}
        />
      )}

      {mode === 'us' && (
        <>
          <BankField
            type="routing"
            value={routingNumber}
            onChange={onRoutingNumberChange ?? (() => {})}
            disabled={disabled}
          />
          <BankField
            type="account"
            value={accountNumber}
            onChange={onAccountNumberChange}
            disabled={disabled}
          />
        </>
      )}

      {mode === 'iban' && (
        <BankField
          type="iban"
          value={iban}
          onChange={onIbanChange ?? (() => {})}
          disabled={disabled}
        />
      )}
    </div>
  );
}
