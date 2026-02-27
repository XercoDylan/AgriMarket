/**
 * Supported currencies: US Dollar and common African currencies.
 * Used at sign-up and for displaying prices in the user's preferred currency.
 */
export const CURRENCIES = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦' },
  { code: 'GHS', name: 'Ghanaian Cedi', symbol: '₵' },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
  { code: 'XOF', name: 'West African CFA Franc', symbol: 'CFA' },
  { code: 'XAF', name: 'Central African CFA Franc', symbol: 'FCFA' },
  { code: 'EGP', name: 'Egyptian Pound', symbol: 'E£' },
  { code: 'TZS', name: 'Tanzanian Shilling', symbol: 'TSh' },
  { code: 'UGX', name: 'Ugandan Shilling', symbol: 'USh' },
  { code: 'ETB', name: 'Ethiopian Birr', symbol: 'Br' },
  { code: 'MAD', name: 'Moroccan Dirham', symbol: 'DH' },
];

export function getCurrencyByCode(code) {
  return CURRENCIES.find((c) => c.code === code) || null;
}

export function formatCurrencyLabel(currencyCode) {
  const c = getCurrencyByCode(currencyCode);
  return c ? `${c.name} (${c.code})` : currencyCode || '—';
}

/**
 * Format a numeric amount with the given currency (symbol + decimals).
 * Uses user's preferred currency when passed; falls back to USD if no code.
 */
export function formatPrice(amount, currencyCode) {
  const num = Number(amount);
  if (num !== num) return '—'; // NaN
  const c = getCurrencyByCode(currencyCode || 'USD');
  const symbol = c ? c.symbol : '$';
  const formatted = num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${symbol}${formatted}`;
}

/** Symbol only, for form labels e.g. "Price (" + getCurrencySymbol(code) + ")" */
export function getCurrencySymbol(currencyCode) {
  const c = getCurrencyByCode(currencyCode);
  return c ? c.symbol : '—';
}
