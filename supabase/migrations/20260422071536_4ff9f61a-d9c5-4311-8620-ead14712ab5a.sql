-- Restaurants table
CREATE TABLE public.restaurants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT,
  website_url TEXT NOT NULL UNIQUE,
  scrape_status TEXT NOT NULL DEFAULT 'pending',
  scrape_error TEXT,
  scraped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Menu items table
CREATE TABLE public.menu_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  price TEXT,
  description TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_menu_items_restaurant ON public.menu_items(restaurant_id);
CREATE INDEX idx_restaurants_url ON public.restaurants(website_url);

-- Enable RLS
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

-- Public access policies (MVP, no auth)
CREATE POLICY "Anyone can view restaurants"
  ON public.restaurants FOR SELECT USING (true);
CREATE POLICY "Anyone can insert restaurants"
  ON public.restaurants FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update restaurants"
  ON public.restaurants FOR UPDATE USING (true);

CREATE POLICY "Anyone can view menu items"
  ON public.menu_items FOR SELECT USING (true);
CREATE POLICY "Anyone can insert menu items"
  ON public.menu_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete menu items"
  ON public.menu_items FOR DELETE USING (true);

-- Updated-at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_restaurants_updated_at
  BEFORE UPDATE ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();