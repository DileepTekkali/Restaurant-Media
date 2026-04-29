# Bite-Sized Banners

Turn restaurant menus into shareable marketing banners in seconds.

## Project Structure

```
bite-sized-banners/
├── frontend/          # React + Vite frontend (deploy to Vercel)
│   ├── src/           # React components, pages, hooks
│   ├── public/        # Static assets
│   ├── package.json
│   ├── vite.config.ts
│   └── vercel.json    # Vercel deployment config
│
├── backend/           # Express.js backend (deploy to Render)
│   ├── server.js      # Express server with API endpoints
│   ├── package.json
│   ├── supabase/      # Supabase Edge Functions (optional)
│   └── render.yaml    # Render deployment config
│
└── README.md
```

## Frontend Deployment (Vercel)

1. Push code to GitHub
2. Import project in Vercel
3. Set root directory to `frontend`
4. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_BACKEND_URL` (your Render backend URL)

## Backend Deployment (Render)

1. Push code to GitHub
2. Create new Web Service in Render
3. Set root directory to `backend`
4. Build command: `npm install`
5. Start command: `npm start`
6. Add environment variables:
   - `GROQ_API_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `PORT` (automatically set by Render)

## Local Development

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Backend
```bash
cd backend
npm install
# Create .env file with required variables
npm run dev
```

## Environment Variables

### Frontend (.env)
```
VITE_SUPABASE_PROJECT_ID=your-project-id
VITE_SUPABASE_PUBLISHABLE_KEY=your-key
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_BACKEND_URL=http://localhost:3000
```

### Backend (.env)
```
GROQ_API_KEY=your-groq-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
PORT=3000
```
