/**
 * Maps ISO 4217 currency codes to their country flag emoji.
 * Uses Unicode regional indicator symbols (no external library needed).
 * Falls back to an empty string for unknown currencies.
 */
const CURRENCY_FLAGS: Record<string, string> = {
  NGN: '🇳🇬', // Nigerian Naira
  USD: '🇺🇸', // US Dollar
  EUR: '🇪🇺', // Euro
  GBP: '🇬🇧', // British Pound
  KES: '🇰🇪', // Kenyan Shilling
  GHS: '🇬🇭', // Ghanaian Cedi
  ZAR: '🇿🇦', // South African Rand
  UGX: '🇺🇬', // Ugandan Shilling
  TZS: '🇹🇿', // Tanzanian Shilling
  XOF: '🇸🇳', // West African CFA Franc (Senegal as representative)
  MAD: '🇲🇦', // Moroccan Dirham
  EGP: '🇪🇬', // Egyptian Pound
  ETB: '🇪🇹', // Ethiopian Birr
  RWF: '🇷🇼', // Rwandan Franc
  MWK: '🇲🇼', // Malawian Kwacha
  ZMW: '🇿🇲', // Zambian Kwacha
  BRL: '🇧🇷', // Brazilian Real
  INR: '🇮🇳', // Indian Rupee
  PHP: '🇵🇭', // Philippine Peso
  MXN: '🇲🇽', // Mexican Peso
  CAD: '🇨🇦', // Canadian Dollar
  AUD: '🇦🇺', // Australian Dollar
  JPY: '🇯🇵', // Japanese Yen
  CNY: '🇨🇳', // Chinese Yuan
  AED: '🇦🇪', // UAE Dirham
  SAR: '🇸🇦', // Saudi Riyal
  IDR: '🇮🇩', // Indonesian Rupiah
  PKR: '🇵🇰', // Pakistani Rupee
  BDT: '🇧🇩', // Bangladeshi Taka
  VND: '🇻🇳', // Vietnamese Dong
  THB: '🇹🇭', // Thai Baht
  MYR: '🇲🇾', // Malaysian Ringgit
  COP: '🇨🇴', // Colombian Peso
  PEN: '🇵🇪', // Peruvian Sol
  CLP: '🇨🇱', // Chilean Peso
  ARS: '🇦🇷', // Argentine Peso
  XAF: '🇨🇲', // Central African CFA Franc (Cameroon as representative)
  TND: '🇹🇳', // Tunisian Dinar
};

/**
 * Returns the flag emoji for a given currency code.
 * Returns an empty string if no flag is mapped.
 */
export function getCurrencyFlag(currencyCode: string): string {
  return CURRENCY_FLAGS[currencyCode.toUpperCase()] ?? '';
}
