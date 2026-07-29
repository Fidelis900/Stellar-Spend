# Security Implementation Guide

This document covers the security features implemented in Stellar-Spend, including input sanitization, security headers, API key rotation, and encryption at rest.

## Table of Contents

1. [Security Headers](#security-headers)
2. [Input Sanitization](#input-sanitization)
3. [API Key Rotation](#api-key-rotation)
4. [Encryption at Rest](#encryption-at-rest)

---

## Security Headers

Security headers are automatically applied to all HTTP responses via the middleware.

### Implemented Headers

- **X-Frame-Options**: `DENY` - Prevents clickjacking attacks
- **X-Content-Type-Options**: `nosniff` - Prevents MIME type sniffing
- **X-XSS-Protection**: `1; mode=block` - Enables XSS protection in older browsers
- **Strict-Transport-Security**: `max-age=31536000; includeSubDomains; preload` - Enforces HTTPS
- **Referrer-Policy**: `strict-origin-when-cross-origin` - Controls referrer information
- **Permissions-Policy**: Restricts browser features and APIs
- **Content-Security-Policy**: Restricts resource loading and execution

### Usage

Headers are automatically applied in `middleware.ts`:

```typescript
import { addSecurityHeaders } from '@/lib/security/headers';

const response = NextResponse.next();
return addSecurityHeaders(response);
```

---

## Input Sanitization

Comprehensive input sanitization prevents injection attacks.

### Available Sanitization Functions

#### HTML Sanitization

```typescript
import { sanitizeHtml } from '@/lib/security/sanitization';

const clean = sanitizeHtml('<script>alert("xss")</script>');
// Returns: ''
```

#### SQL Injection Prevention

```typescript
import { escapeSql } from '@/lib/security/sanitization';

const safe = escapeSql("'; DROP TABLE users; --");
// Returns: '\\'; DROP TABLE users; --'
```

#### NoSQL Injection Prevention

```typescript
import { escapeNoSql } from '@/lib/security/sanitization';

const safe = escapeNoSql({ $ne: null });
// Returns: { \\$ne: null }
```

#### Command Injection Prevention

```typescript
import { escapeShell } from '@/lib/security/sanitization';

const safe = escapeShell('$(rm -rf /)');
// Returns: '$(rm -rf /)'
```

#### URL Sanitization

```typescript
import { sanitizeUrl } from '@/lib/security/sanitization';

const safe = sanitizeUrl('https://example.com');
// Returns: 'https://example.com/'

const unsafe = sanitizeUrl('javascript:alert("xss")');
// Returns: ''
```

#### Email Sanitization

```typescript
import { sanitizeEmail } from '@/lib/security/sanitization';

const safe = sanitizeEmail('  USER@EXAMPLE.COM  ');
// Returns: 'user@example.com'
```

#### Blockchain Address Sanitization

```typescript
import { sanitizeBlockchainAddress } from '@/lib/security/sanitization';

const safe = sanitizeBlockchainAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37AA96045');
// Returns: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045'
```

#### Stellar Address Sanitization

```typescript
import { sanitizeStellarAddress } from '@/lib/security/sanitization';

const safe = sanitizeStellarAddress('GCFX...ABCD');
// Returns: 'GCFX...ABCD' or ''
```

#### Prototype Pollution Prevention

```typescript
import { sanitizeObjectKeys } from '@/lib/security/sanitization';

const safe = sanitizeObjectKeys({
  name: 'John',
  __proto__: { admin: true },
  constructor: { isAdmin: true },
});
// Returns: { name: 'John' }
```

---

## API Key Rotation

Automated API key rotation system with grace periods and monitoring.

### Configuration

```typescript
import { performAutoRotation } from '@/lib/security/api-key-rotation';

const config = {
  rotationIntervalMs: 90 * 24 * 60 * 60 * 1000, // 90 days
  gracePeriodMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  enableAutoRotation: true,
  notificationEmail: 'admin@example.com',
};
```

### Usage

#### Get Keys Needing Rotation

```typescript
import { getKeysNeedingRotation } from '@/lib/security/api-key-rotation';

const keys = await getKeysNeedingRotation(config);
```

#### Perform Automatic Rotation

```typescript
import { performAutoRotation } from '@/lib/security/api-key-rotation';

const result = await performAutoRotation(config);
console.log(`Rotated: ${result.rotatedCount}, Failed: ${result.failedCount}`);
```

#### Get Rotation Status

```typescript
import { getRotationStatus } from '@/lib/security/api-key-rotation';

const status = await getRotationStatus(keyId);
console.log(`Days until rotation: ${status.daysUntilRotation}`);
console.log(`In grace period: ${status.inGracePeriod}`);
```

#### Revoke Expired Keys

```typescript
import { revokeExpiredRotatedKeys } from '@/lib/security/api-key-rotation';

const result = await revokeExpiredRotatedKeys(config);
console.log(`Revoked: ${result.revokedCount}`);
```

### Scheduling Rotation

Add to a cron job or scheduled task:

```typescript
import { performAutoRotation, revokeExpiredRotatedKeys } from '@/lib/security/api-key-rotation';

export async function rotationScheduledTask() {
  const config = {
    rotationIntervalMs: 90 * 24 * 60 * 60 * 1000,
    gracePeriodMs: 7 * 24 * 60 * 60 * 1000,
    enableAutoRotation: true,
  };

  // Perform rotation
  const rotationResult = await performAutoRotation(config);
  console.log(`Rotated ${rotationResult.rotatedCount} keys`);

  // Revoke expired keys
  const revocationResult = await revokeExpiredRotatedKeys(config);
  console.log(`Revoked ${revocationResult.revokedCount} keys`);
}
```

---

## Encryption at Rest

Comprehensive encryption for sensitive data at rest.

### Environment Setup

Set the encryption key in your environment:

```bash
# Generate a new key
ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Or use a password (will be derived using PBKDF2)
ENCRYPTION_KEY="your-secure-password"
```

### Data Encryption

#### Encrypt/Decrypt Strings

```typescript
import { encryptData, decryptData } from '@/lib/security/encryption';

const plaintext = 'sensitive data';
const encrypted = encryptData(plaintext);
const decrypted = decryptData(encrypted);
```

#### Encrypt/Decrypt Objects

```typescript
import { encryptObject, decryptObject } from '@/lib/security/encryption';

const obj = { apiKey: 'secret', userId: '123' };
const encrypted = encryptObject(obj);
const decrypted = decryptObject(encrypted);
```

#### Hash Data

```typescript
import { hashData, verifyHash } from '@/lib/security/encryption';

const data = 'password';
const hash = hashData(data);
const isValid = verifyHash(data, hash);
```

### Sensitive Field Encryption

```typescript
import { encryptSensitiveFields, decryptSensitiveFields } from '@/lib/security/encryption';

const user = {
  name: 'John',
  password: 'secret123',
  apiKey: 'key456',
};

// Encrypt sensitive fields
const encrypted = encryptSensitiveFields(user, ['password', 'apiKey']);
// Result: { name: 'John', password_encrypted: '...', apiKey_encrypted: '...' }

// Decrypt sensitive fields
const decrypted = decryptSensitiveFields(encrypted, ['password', 'apiKey']);
// Result: { name: 'John', password: 'secret123', apiKey: 'key456' }
```

### localStorage Encryption

```typescript
import { encryptLocalStorageData, decryptLocalStorageData } from '@/lib/security/encryption';

// Encrypt and store
const data = { transactions: [...], user: {...} };
encryptLocalStorageData('appData', data);

// Retrieve and decrypt
const decrypted = decryptLocalStorageData('appData');
```

### Log Entry Encryption

```typescript
import { encryptLogEntry } from '@/lib/security/encryption';

const logEntry = {
  action: 'login',
  password: 'secret123',
  token: 'abc123',
  timestamp: Date.now(),
};

const encrypted = encryptLogEntry(logEntry);
// Sensitive fields are hashed instead of encrypted
```

### Backup Encryption

```typescript
import { encryptBackupData, decryptBackupData } from '@/lib/security/encryption';

const data = { transactions: [...], users: [...] };

// Create encrypted backup
const backup = encryptBackupData(data);

// Restore from backup
const restored = decryptBackupData(backup);
```

### Database Encryption

#### Encrypt Table Column

```typescript
import { encryptTableColumn } from '@/lib/security/database-encryption';

const result = await encryptTableColumn('users', 'email', 'email_encrypted');
console.log(`Encrypted: ${result.encrypted}, Failed: ${result.failed}`);
```

#### Get Encryption Status

```typescript
import { getTableEncryptionStatus } from '@/lib/security/database-encryption';

const status = await getTableEncryptionStatus('users', 'email_encrypted');
console.log(`Encryption: ${status.encryptionPercentage}%`);
```

#### Rotate Encryption Keys

```typescript
import { rotateTableColumnEncryption } from '@/lib/security/database-encryption';

const result = await rotateTableColumnEncryption('users', 'email_encrypted');
console.log(`Rotated: ${result.rotated}, Failed: ${result.failed}`);
```

#### Create Encrypted Backup

```typescript
import { createEncryptedBackup } from '@/lib/security/database-encryption';

const backup = await createEncryptedBackup('users', ['id', 'name', 'email']);
// Save backup to secure storage
```

#### Restore Encrypted Backup

```typescript
import { restoreEncryptedBackup } from '@/lib/security/database-encryption';

const result = await restoreEncryptedBackup(backup, 'users');
console.log(`Restored: ${result.restored}, Failed: ${result.failed}`);
```

---

## Best Practices

1. **Always use HTTPS** - Encryption at rest is useless without encryption in transit
2. **Rotate encryption keys regularly** - Use the key rotation utilities
3. **Sanitize all user input** - Use appropriate sanitization functions for each input type
4. **Hash passwords** - Never store plaintext passwords
5. **Use environment variables** - Store encryption keys in secure environment variables
6. **Monitor encryption status** - Regularly check encryption status of sensitive data
7. **Test recovery procedures** - Ensure backups can be restored successfully
8. **Log security events** - Track encryption, rotation, and sanitization events

---

## Migration Guide

### Migrating Existing Data to Encrypted Storage

1. Add encrypted columns to your tables:

```sql
ALTER TABLE users ADD COLUMN email_encrypted TEXT;
ALTER TABLE users ADD COLUMN phone_encrypted TEXT;
```

2. Encrypt existing data:

```typescript
import { encryptTableColumn } from '@/lib/security/database-encryption';

await encryptTableColumn('users', 'email', 'email_encrypted');
await encryptTableColumn('users', 'phone', 'phone_encrypted');
```

3. Update application code to use encrypted columns

4. Verify encryption status:

```typescript
import { getTableEncryptionStatus } from '@/lib/security/database-encryption';

const status = await getTableEncryptionStatus('users', 'email_encrypted');
if (status.encryptionPercentage === 100) {
  // Safe to remove old columns
}
```

5. Remove old unencrypted columns (after verification):

```sql
ALTER TABLE users DROP COLUMN email;
ALTER TABLE users DROP COLUMN phone;
```

---

## Troubleshooting

### Decryption Failures

If decryption fails, check:

1. Encryption key is correct (ENCRYPTION_KEY env var)
2. Data wasn't tampered with
3. Backup of encrypted data exists

### Performance Issues

If encryption/decryption is slow:

1. Consider using database-level encryption instead
2. Cache decrypted values when appropriate
3. Use batch operations for large datasets

### Key Rotation Issues

If key rotation fails:

1. Check database connectivity
2. Verify old and new keys are available
3. Review error logs for specific failures
