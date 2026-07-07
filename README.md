# Task Diary

MERN Todo app with email verification, login OTP, task categories, priorities, due dates, and email reminders.

## Deploy Backend On Render

Use the `backend` folder as the Render root. If you deploy with `render.yaml`, it already sets `rootDir: backend`.

```txt
Root Directory: backend
Build Command: npm install && npm run build
Start Command: npm start
```

Add these Render environment variables:

```txt
MONGO_URL=your_mongodb_connection_string
JWT_SECRET=replace_with_a_long_random_secret
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_gmail_app_password
CLIENT_URL=https://your-vercel-frontend-url.vercel.app
FRONTEND_URLS=https://your-vercel-frontend-url.vercel.app
```

Backend health check:

```txt
https://to-do-list-2-3kqc.onrender.com/api
https://to-do-list-2-3kqc.onrender.com/api/health
```

## Deploy Frontend On Vercel

Use the `frontend` folder as the Vercel root.

```txt
Root Directory: frontend
Build Command: npm install && npm run build
Output Directory: dist
```

Add this Vercel environment variable:

```txt
VITE_API_URL=https://to-do-list-2-3kqc.onrender.com
```

After changing Vercel environment variables, redeploy the frontend. Vite reads `VITE_API_URL` at build time, so the old deployment will not pick it up automatically.

## Local Development

Backend:

```powershell
cd backend
npm install
npm start
```

Frontend:

```powershell
cd frontend
npm install
npm.cmd run dev
```

## Important Security Note

Do not commit `.env` files. If credentials were shared in chat/screenshots, rotate them:

- MongoDB database password
- Gmail App Password
- JWT secret
