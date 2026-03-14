# Linkd'N V2

This V2 reorganizes Linkd'N around:
- Owner accounts and dashboards
- Multi-venue ownership
- Venue-specific control panels
- Worker/employee access levels
- Messaging and friendly venues placeholders
- Paywall simulation for venue activation
- Admin/moderator control center

## Structure
- web/ — static frontend
- backend/ — Express API skeleton
- supabase/ — schema additions
- docs/ — deployment guide

## Local run
Frontend:
```bash
cd web
python3 -m http.server 8080
```

Backend:
```bash
cd backend
npm install
npm run dev
```
