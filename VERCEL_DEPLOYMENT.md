# Deploy Mis Dekhli Chinese DZ on Vercel

This edition is adapted for Vercel's serverless Express runtime.

- Vercel hosts the Express application and static website.
- Neon stores teachers, students, approvals, and video metadata.
- The browser uploads videos directly to Cloudinary, so video files do not pass through the Vercel Function body-size limit.

## Important free-plan rule

Vercel Hobby is free but is restricted to personal, non-commercial use. It is suitable for development, demonstration, or a personal learning project. A paid school/business deployment requires a Vercel Pro plan or another host that allows free commercial use.

## 1. Replace the GitHub repository files

Upload all files from this folder to the root of your GitHub repository. The GitHub main page must show at least:

```text
package.json
package-lock.json
server.js
public/
VERCEL_DEPLOYMENT.md
```

Do not upload `.env`, `node_modules`, or the ZIP file.

## 2. Import the repository into Vercel

1. Sign in to Vercel with GitHub.
2. Select **Add New → Project**.
3. Import the GitHub repository.
4. Keep **Root Directory** empty when `package.json` is in the repository root.
5. Keep Framework Preset on the automatically detected Express/Other preset.
6. Leave Build Command and Output Directory at their defaults.

## 3. Add environment variables

Before deploying, add these variables for Production, Preview, and Development:

```text
DATABASE_URL
JWT_SECRET
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
CLOUDINARY_FOLDER
MAX_VIDEO_MB
TEACHER_NAME
TEACHER_EMAIL
TEACHER_PASSWORD
```

Recommended values:

```text
CLOUDINARY_FOLDER=mis-dekhli-chinese-dz
MAX_VIDEO_MB=100
TEACHER_NAME=Mis Dekhli Teacher
```

Use the Neon pooled `DATABASE_URL` whose hostname contains `-pooler`.

Use the Cloudinary cloud name, API key, and API secret from the same API-key row. Paste only each value, without quotes or `KEY=` inside the value field.

Generate `JWT_SECRET` in PowerShell:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## 4. Deploy

Select **Deploy**. When the deployment is ready, open:

```text
https://YOUR-PROJECT.vercel.app/api/health
```

A successful response resembles:

```json
{"ok":true,"app":"Mis Dekhli Chinese DZ","database":"Neon","media":"Cloudinary"}
```

Then open the main Vercel address and sign in with `TEACHER_EMAIL` and `TEACHER_PASSWORD`.

## 5. Test the workflow

1. Register a test student.
2. Approve the student from the teacher dashboard.
3. Upload a small MP4.
4. Sign in as the student and verify that the video appears only for its assigned HSK level.

## Updating the application

Push changes to the connected GitHub branch. Vercel creates a new deployment automatically.

Environment-variable changes affect only new deployments. Redeploy after changing any variable.

## Troubleshooting

### The server is not configured yet

Confirm that `DATABASE_URL` and all three Cloudinary variables exist, then redeploy.

### Invalid Cloudinary signature

The API key and API secret do not match. Copy the cloud name, key, and secret from the same Cloudinary product environment and API-key row.

### FUNCTION_PAYLOAD_TOO_LARGE

This package sends videos directly from the browser to Cloudinary. If this error appears, confirm that you uploaded this Vercel edition and that `public/app.js` requests `/api/teacher/videos/signature` before uploading to Cloudinary.

### Teacher password did not change

The teacher account is created only when no teacher exists. Changing the environment variable does not update an existing database account.


## Protected playback update (v1.5)

After deploying this version, students use a custom video player. The normal browser download menu is not shown, right-click and mobile long-press are blocked on the video area, and each lesson displays the signed-in student's name as a watermark. No additional Vercel environment variable is required.
