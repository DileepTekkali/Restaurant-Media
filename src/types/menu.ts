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

export const CATEGORY_ORDER = [
  "Starters",
  "Mains",
  "Sides",
  "Desserts",
  "Beverages",
  "Specials",
  "Other",
] as const;

export const CATEGORY_COLOR_VAR: Record<string, string> = {
  Starters: "--cat-starters",
  Mains: "--cat-mains",
  Desserts: "--cat-desserts",
  Beverages: "--cat-beverages",
  Sides: "--cat-sides",
  Specials: "--cat-specials",
  Other: "--cat-other",
};
