# Mis Dekhli Chinese DZ v1.3

A responsive Chinese learning platform for HSK 1, HSK 2, and HSK 3.

## Included features

- Student registration with name, email, phone number, password, and HSK level
- Teacher approval before lesson access
- Teacher dashboard for approving, searching, and removing students
- Teacher video uploads directly from the computer
- HSK-restricted student lessons
- Protected Cloudinary video delivery
- Neon PostgreSQL persistence
- Responsive phone, tablet, and desktop interface

## Free deployment

Follow [FREE_DEPLOYMENT.md](FREE_DEPLOYMENT.md). The recommended free setup is:

- Render Free for the Node.js app
- Neon Free for the database
- Cloudinary Free for videos

## Local setup

Local testing also uses Neon and Cloudinary.

1. Copy `.env.example` to `.env`.
2. Fill in `DATABASE_URL`, `CLOUDINARY_URL`, `JWT_SECRET`, and teacher credentials.
3. Run:

```powershell
npm install
npm start
```

4. Open `http://localhost:3000`.

## Security before launch

- Use a long random `JWT_SECRET`.
- Use a unique teacher password.
- Never commit `.env`, Neon credentials, or the Cloudinary API secret.
- Use the generated HTTPS Render address.

## Video guidance

- Maximum supported free-deployment upload: 100 MB per video.
- MP4 with H.264 video and AAC audio is recommended for browser compatibility.
- Compress long lessons before uploading to reduce storage and student bandwidth.
