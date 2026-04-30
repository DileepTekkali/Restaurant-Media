// API client for backend services
// Update VITE_BACKEND_URL in .env to point to your Render deployment

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

interface DishCopyRequest {
  dishName: string;
  dishDescription?: string | null;
  campaignType: string;
  festival?: string | null;
  restaurantName?: string | null;
}

interface DishCopyResponse {
  tagline?: string;
  error?: string;
}

interface GenerateImageRequest {
  prompt: string;
  width?: number;
  height?: number;
  seed?: number;
  model?: string;
  nologo?: boolean;
  enhance?: boolean;
}

interface ScrapeMenuRequest {
  restaurantUrl: string;
}

interface ScrapeMenuResponse {
  restaurantId?: string;
  restaurantName?: string;
  status: string;
  menuItems: Array<{
    id: string;
    name: string;
    category: string;
    price: string | null;
    description: string | null;
    image_url?: string | null;
  }>;
  menuItemsCount?: number;
  pagesFetched?: number;
  logoUrl?: string | null;
  error?: string;
}

export async function scrapeMenu(body: ScrapeMenuRequest): Promise<ScrapeMenuResponse> {
  const res = await fetch(`${BACKEND_URL}/api/scrape-menu`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function generateDishCopy(body: DishCopyRequest): Promise<DishCopyResponse> {
  const res = await fetch(`${BACKEND_URL}/api/dish-copy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function generateImage(body: GenerateImageRequest): Promise<Blob> {
  const res = await fetch(`${BACKEND_URL}/api/generate-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Image generation failed: ${res.status}`);
  return res.blob();
}
