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
