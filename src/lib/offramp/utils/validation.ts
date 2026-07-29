export function validateAmount(amount: string): boolean {
  if (!/^\d*\.?\d*$/.test(amount.trim()) || amount.trim() === '' || amount.trim() === '.')
    return false;
  const num = parseFloat(amount);
  return !isNaN(num) && num > 0 && isFinite(num);
}

export function validateAddress(address: string, chain: 'stellar' | 'base'): boolean {
  if (!address) return false;
  if (chain === 'stellar') return /^G[A-Z0-9]{55}$/.test(address);
  if (chain === 'base') return /^0x[a-fA-F0-9]{40}$/.test(address);
  return false;
}

export function validateEvmAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function validateAccountNumber(accountNumber: string): boolean {
  return /^\d{10}$/.test(accountNumber);
}

export function sanitizeInput(input: string): string {
  return input.trim().replace(/[^\w\s.-]/g, '');
}

export function validateToken(token: string): boolean {
  return ['USDC', 'USDT'].includes(token.toUpperCase());
}

export function isValidQuote(data: unknown): data is {
  destinationAmount: string;
  rate: number;
  currency: string;
  bridgeFee: string;
  payoutFee: string;
  estimatedTime: number;
} {
  if (!data || typeof data !== 'object') return false;

  const q = data as Record<string, unknown>;

  // Check all required fields exist
  if (
    typeof q.destinationAmount !== 'string' ||
    typeof q.rate !== 'number' ||
    typeof q.currency !== 'string' ||
    typeof q.bridgeFee !== 'string' ||
    typeof q.payoutFee !== 'string' ||
    typeof q.estimatedTime !== 'number'
  ) {
    return false;
  }

  // Validate numeric fields are finite and positive
  const rate = q.rate as number;
  const estimatedTime = q.estimatedTime as number;

  if (!isFinite(rate) || rate <= 0) return false;
  if (!isFinite(estimatedTime) || estimatedTime < 0) return false;

  // Validate string amounts are non-empty
  const destAmount = q.destinationAmount as string;
  const bridgeFee = q.bridgeFee as string;
  const payoutFee = q.payoutFee as string;

  if (!destAmount.trim() || !bridgeFee.trim() || !payoutFee.trim()) return false;

  // Validate amounts are valid numbers
  const destNum = parseFloat(destAmount);
  const bridgeNum = parseFloat(bridgeFee);
  const payoutNum = parseFloat(payoutFee);

  if (!isFinite(destNum) || destNum <= 0) return false;
  if (!isFinite(bridgeNum) || bridgeNum < 0) return false;
  if (!isFinite(payoutNum) || payoutNum < 0) return false;

  return true;
}
