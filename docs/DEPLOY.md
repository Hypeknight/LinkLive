# Deploying Linkd'N V2

## GitHub
From the project root:
```bash
git init
git add .
git commit -m "Linkd'N V2"
git branch -M main
git remote add origin git@github.com:YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

## Render backend
- Service type: Web Service
- Root Directory: backend
- Build Command: npm install
- Start Command: npm run dev
- Add environment variables in Render dashboard

## Cloudflare frontend
Deploy the `web` folder as static assets/Worker assets.
Use your repo as the source.

## Required env vars
Backend:
- PORT
- FRONTEND_ORIGIN
- LIVEKIT_URL
- LIVEKIT_API_KEY
- LIVEKIT_API_SECRET
- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
