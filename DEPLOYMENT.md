# MENU2MEDIA — Deployment Guide

## Production Build Status: ✅ Ready

Your app is now production-ready with proper image generation via Supabase Edge Functions.

---

## Quick Start Checklist

- [x] Production bundle built (`dist/` folder)
- [x] Supabase Edge Function created
- [ ] Deploy Edge Function
- [ ] Deploy frontend
- [ ] Configure environment variables

---

## Step 1: Deploy Supabase Edge Function

### Prerequisites
- Supabase CLI installed: `brew install supabase/tap/supabase`
- Supabase project created at https://supabase.com
- Access token from Supabase dashboard

### Deploy the Function

```bash
cd /Users/tekkalidileep/lovable/bite-sized-banners

# Login to Supabase
supabase login

# Deploy the generate-image function
supabase functions deploy generate-image
```

**Expected output:**
```
✓ Function generate-image deployed successfully
```

---

## Step 2: Deploy Frontend

### Option A: Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

### Option B: Netlify

```bash
# Create netlify.toml if not exists
touch netify.toml
```

Add to `netlify.toml`:
```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

Then:
```bash
netlify deploy --prod
```

### Option C: Docker / Self-Hosted

```bash
# Build production bundle
npm run build

# Serve dist folder with any static host (nginx, caddy, Python3 http.server, etc)
python3 -m http.server 8080 --directory dist
```

---

## Step 3: Configure Environment Variables

In your deployment platform, set:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

(These values are in your Supabase project settings)

---

## Step 4: Test Image Generation

1. Open your deployed app
2. Enter a restaurant menu URL
3. Select a campaign type
4. Choose banner formats
5. Click "Generate Banners"
6. Check browser console for:
   - `[Pollinations] Attempt 1 - using Supabase Edge Function`
   - `[Pollinations] Loaded: [dish name]`

### If generation fails:
- Fallback gracefully to styled gradient images
- Banners still complete successfully
- Check Supabase Edge Function logs for errors

---

## Troubleshooting

### Edge Function returns 404
**Solution:** Function not deployed. Run `supabase functions deploy generate-image`

### CORS errors in console
**Solution:** Normal in development. Production uses Edge Function which bypasses CORS.

### Images not generating
**Solution:** Check if:
1. Supabase project is active
2. Edge Function is deployed
3. Environment variables are set correctly
4. Network requests show 200 in browser DevTools

### Fallback gradients appearing instead of real images
**Solution:** This is intentional! If Pollinations is temporarily blocked, app gracefully falls back to beautiful gradient images. Banners still generate successfully.

---

## File Structure After Build

```
dist/
  ├── index.html          (entry point)
  ├── assets/
  │   ├── index-*.js      (bundled app)
  │   └── index-*.css     (bundled styles)
  └── favicon.ico
```

Upload entire `dist/` folder to your hosting provider.

---

## What Images Use

The app uses **two sources** for dish images:

1. **Scraped Images** (Primary)
   - From restaurant website menu URLs
   - Routed through `images.weserv.nl` proxy to avoid CORS

2. **Generated Images** (Fallback)
   - From Pollinations AI via Supabase Edge Function
   - Beautiful gradient fallback if generation fails

---

## Production Monitoring

### Important Logs to Watch

**Supabase Dashboard → Edge Functions → Logs:**
```
[generate-image] Invoking Pollinations API
[generate-image] Successfully generated image
```

**Browser Console:**
```
[Pollinations] Loaded: [dish name]
[Pollinations] Using fallback gradient for: [dish name]
```

---

## Performance Tips

1. **Enable caching:** Images are cached `max-age=31536000`
2. **Monitor bundle size:** Currently 569.39 KB (170.56 KB gzipped)
3. **Use CDN:** Place your static assets on a CDN for faster delivery

---

## Support & Issues

If banner generation fails:

1. Check browser DevTools → Network → generate-image request
2. View Supabase Edge Function logs
3. Verify environment variables are set
4. Ensure Supabase project is active and funded

---

**Ready to deploy!** 🚀
