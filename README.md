# Mis Dekhli Chinese DZ — Vercel Edition v1.5

A responsive Chinese-learning platform for HSK 1, HSK 2, and HSK 3.

## Features

- Student registration with name, email, phone number, password, and HSK level
- Teacher approval before lesson access
- Teacher student management and removal
- Direct teacher video uploads from the computer to Cloudinary
- Neon PostgreSQL persistence
- Approved students see only videos for their assigned HSK level
- Authenticated Cloudinary video delivery
- Custom student video player with no native download button
- Right-click and mobile long-press protection on lesson videos
- Student-name watermark on playback
- Responsive phone, tablet, and desktop interface
- Vercel-compatible Express export

## Local development

```powershell
npm install
Copy-Item .env.example .env
npm start
```

Open `http://localhost:3000`.

Configure `.env` with Neon, Cloudinary, teacher credentials, and a strong `JWT_SECRET` before testing cloud features.

## Vercel deployment

See `VERCEL_DEPLOYMENT.md` for the complete procedure.


## Video protection note

The student player removes the browser's native media controls, blocks the normal right-click/long-press menu, disables picture-in-picture and remote playback where supported, and displays the signed-in student's name as a watermark.

This prevents ordinary download actions, but no browser-only solution can guarantee that a determined user will never copy or screen-record a video.
