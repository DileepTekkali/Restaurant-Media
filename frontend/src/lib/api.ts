// API client for Supabase Edge Functions

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

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
  const res = await fetch(`${SUPABASE_URL}/functions/v1/dish-copy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function generateImage(body: GenerateImageRequest): Promise<Blob> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Image generation failed: ${res.status}`);
  return res.blob();
}
