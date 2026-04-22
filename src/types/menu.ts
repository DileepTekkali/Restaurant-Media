export interface MenuItem {
  id: string;
  restaurant_id: string;
  name: string;
  category: string | null;
  price: string | null;
  description: string | null;
  image_url: string | null;
  created_at: string;
}

export interface ScrapeResponse {
  restaurantId: string;
  restaurantName?: string | null;
  status: "completed" | "failed";
  menuItems: MenuItem[];
  error?: string;
}

// Generic fallback categories (used only when website headings aren't found).
// We keep their ordering so generic menus look consistent.
export const GENERIC_CATEGORY_ORDER = [
  "Starters",
  "Soups",
  "Mains",
  "Sides",
  "Desserts",
  "Beverages",
  "Specials",
  "Other",
] as const;

// Color tokens for the generic fallback categories.
const GENERIC_CATEGORY_COLOR_VAR: Record<string, string> = {
  Starters: "--cat-starters",
  Soups: "--cat-soups",
  Mains: "--cat-mains",
  Desserts: "--cat-desserts",
  Beverages: "--cat-beverages",
  Sides: "--cat-sides",
  Specials: "--cat-specials",
  Other: "--cat-other",
};

// Rotating palette used for website-defined (custom) categories so each gets
// a distinct, stable color without us needing to predefine them all.
const CUSTOM_CATEGORY_PALETTE = [
  "--cat-starters",
  "--cat-soups",
  "--cat-mains",
  "--cat-desserts",
  "--cat-beverages",
  "--cat-sides",
  "--cat-specials",
];

/** Stable hash so the same category name always gets the same color. */
function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Resolve a CSS variable name (without the leading --) for a category. */
export function getCategoryColorVar(category: string): string {
  if (GENERIC_CATEGORY_COLOR_VAR[category]) {
    return GENERIC_CATEGORY_COLOR_VAR[category];
  }
  const idx = hashString(category.toLowerCase()) % CUSTOM_CATEGORY_PALETTE.length;
  return CUSTOM_CATEGORY_PALETTE[idx];
}
