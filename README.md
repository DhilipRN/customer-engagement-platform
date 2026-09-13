# Customer Engagement Platform

Phase 1 foundation for a multi-business customer-engagement platform. WhatsApp delivery is deliberately simulated until the official Meta WhatsApp Business Platform integration is introduced in Phase 2.

## Backend

```powershell
cd backend
Copy-Item .env.example .env
npm install
npm run dev
```

The API health endpoint is available at `GET /health`.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` remain server-only environment variables. Do not expose them in a frontend build.
