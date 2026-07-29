import crypto from 'crypto';

export interface SavedBeneficiary {
  id: string;
  name: string;
  accountNumber: string;
  bankCode: string;
  currency: string;
  createdAt: number;
  encryptedData: string;
}

const ENCRYPTION_KEY = process.env.BENEFICIARY_ENCRYPTION_KEY || 'default-key-change-in-production';

function encrypt(data: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    'aes-256-cbc',
    Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)),
    iv,
  );
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedData: string): string {
  const [iv, encrypted] = encryptedData.split(':');
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)),
    Buffer.from(iv, 'hex'),
  );
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export class BeneficiaryStorage {
  private static readonly STORAGE_KEY = 'stellar_spend_beneficiaries';

  static saveBeneficiary(
    beneficiary: Omit<SavedBeneficiary, 'id' | 'createdAt' | 'encryptedData'>,
  ): SavedBeneficiary {
    const id = crypto.randomUUID();
    const sensitiveData = JSON.stringify({
      accountNumber: beneficiary.accountNumber,
      bankCode: beneficiary.bankCode,
    });

    const saved: SavedBeneficiary = {
      id,
      name: beneficiary.name,
      currency: beneficiary.currency,
      createdAt: Date.now(),
      encryptedData: encrypt(sensitiveData),
      accountNumber: '', // Placeholder
      bankCode: '', // Placeholder
    };

    const beneficiaries = this.getAllBeneficiaries();
    beneficiaries.push(saved);
    this.persistBeneficiaries(beneficiaries);
    return saved;
  }

  static getBeneficiary(id: string): SavedBeneficiary | null {
    const beneficiaries = this.getAllBeneficiaries();
    return beneficiaries.find((b) => b.id === id) || null;
  }

  static getAllBeneficiaries(): SavedBeneficiary[] {
    if (typeof window === 'undefined') return [];
    const stored = localStorage.getItem(this.STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  }

  static deleteBeneficiary(id: string): boolean {
    const beneficiaries = this.getAllBeneficiaries();
    const filtered = beneficiaries.filter((b) => b.id !== id);
    if (filtered.length === beneficiaries.length) return false;
    this.persistBeneficiaries(filtered);
    return true;
  }

  static updateBeneficiary(
    id: string,
    updates: Partial<Omit<SavedBeneficiary, 'id' | 'createdAt'>>,
  ): SavedBeneficiary | null {
    const beneficiaries = this.getAllBeneficiaries();
    const index = beneficiaries.findIndex((b) => b.id === id);
    if (index === -1) return null;

    const updated = { ...beneficiaries[index], ...updates };
    if (updates.accountNumber || updates.bankCode) {
      updated.encryptedData = encrypt(
        JSON.stringify({
          accountNumber: updates.accountNumber || beneficiaries[index].accountNumber,
          bankCode: updates.bankCode || beneficiaries[index].bankCode,
        }),
      );
    }

    beneficiaries[index] = updated;
    this.persistBeneficiaries(beneficiaries);
    return updated;
  }

  private static persistBeneficiaries(beneficiaries: SavedBeneficiary[]): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(beneficiaries));
    }
  }

  static decryptBeneficiary(
    beneficiary: SavedBeneficiary,
  ): SavedBeneficiary & { accountNumber: string; bankCode: string } {
    const decrypted = JSON.parse(decrypt(beneficiary.encryptedData));
    return {
      ...beneficiary,
      accountNumber: decrypted.accountNumber,
      bankCode: decrypted.bankCode,
    };
  }
}
