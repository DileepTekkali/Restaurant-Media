// Shared currency detection / formatting helpers.
// Used by both the menu preview and the banner studio so prices look
// consistent across the app and always carry a visible currency symbol.

import type { MenuItem } from "@/types/menu";

const CURRENCY_PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:INR|Rs\.?|rupees?)\b/i, "₹"],
  [/\b(?:USD|US\$)\b/i, "$"],
  [/\b(?:EUR|euros?)\b/i, "€"],
  [/\b(?:GBP|pounds?|sterling)\b/i, "£"],
  [/\b(?:JPY|yen)\b/i, "¥"],
  [/\b(?:AED|dirhams?)\b/i, "د.إ"],
  [/\b(?:SAR|riyals?)\b/i, "﷼"],
];

const CURRENCY_SYMBOLS = ["₹", "$", "€", "£", "¥", "د.إ", "﷼", "₩", "₽", "₺", "฿"];

export function detectCurrencyFromPrice(price: string): string | null {
  for (const sym of CURRENCY_SYMBOLS) {
    if (price.includes(sym)) return sym;
  }
  for (const [re, sym] of CURRENCY_PATTERNS) {
    if (re.test(price)) return sym;
  }
  return null;
}

/** Pick the most common currency symbol across a menu's prices. */
export function detectMenuCurrency(items: MenuItem[]): string {
  const counts = new Map<string, number>();
  for (const it of items) {
    if (!it.price) continue;
    const sym = detectCurrencyFromPrice(it.price);
    if (sym) counts.set(sym, (counts.get(sym) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  counts.forEach((n, sym) => {
    if (n > bestN) {
      best = sym;
      bestN = n;
    }
  });
  return best ?? "$";
}

/** Strip trailing zero decimals: "$28.00" → "$28", "12.50" → "12.5", "10." → "10". */
export function stripTrailingZeros(price: string): string {
  return price.replace(/(\d)\.0+(?!\d)/g, "$1").replace(/(\d\.\d*?)0+(?!\d)/g, "$1").replace(/(\d)\.(?!\d)/g, "$1");
}

/** Ensure the displayed price string carries an explicit currency symbol. */
export function formatPriceWithCurrency(price: string, fallbackSymbol: string): string {
  const trimmed = price.trim();
  if (!trimmed) return trimmed;
  const withSymbol = detectCurrencyFromPrice(trimmed)
    ? trimmed
    : `${fallbackSymbol}${trimmed.replace(/^(?:Rs\.?|INR|USD|EUR|GBP|US\$)\s*/i, "")}`;
  return stripTrailingZeros(withSymbol);
}
