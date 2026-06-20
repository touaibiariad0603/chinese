# Free deployment — Render + Neon + Cloudinary

This edition does not need Railway, a paid disk, or a trial subscription.

- **Render Free:** hosts the Node.js website.
- **Neon Free:** permanently stores teachers, students, approvals, and lesson metadata.
- **Cloudinary Free:** stores and streams teacher-uploaded videos.

The free services have usage limits. Keep videos compressed and no larger than 100 MB each.

## 1. Put the project on GitHub

1. Create a free GitHub account if needed.
2. Create a new repository named `mis-dekhli-chinese-dz`.
3. Upload every file from this folder. Do not upload `.env` or `node_modules`.

You can also use PowerShell:

```powershell
git init
git add .
git commit -m "Initial Mis Dekhli Chinese DZ deployment"
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
```

## 2. Create the free Neon database

1. Open `https://console.neon.tech` and create a free account.
2. Create a project. A nearby European region is a good choice for Algeria.
3. Open **Connect**.
4. Select the **pooled connection** option.
5. Copy the PostgreSQL connection string. It starts with `postgresql://` and ends with `sslmode=require`.

The application creates its tables automatically on the first deployment. Do not run SQL manually.

## 3. Create the free Cloudinary media account

1. Open `https://cloudinary.com/users/register_free` and create a free account.
2. In the Cloudinary Console, open **API Keys** or the dashboard.
3. Copy the **API Environment Variable**, which looks like:

```text
cloudinary://API_KEY:API_SECRET@CLOUD_NAME
```

Keep the API secret private. Never put it in GitHub or frontend code.

## 4. Deploy on Render Free

1. Open `https://dashboard.render.com` and create a free account.
2. Choose **New → Blueprint** and connect your GitHub repository.
3. Render detects `render.yaml`.
4. Choose the **Free** service plan.
5. Enter the requested secret environment variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon pooled connection string |
| `CLOUDINARY_URL` | Cloudinary API Environment Variable |
| `TEACHER_EMAIL` | Your teacher email |
| `TEACHER_PASSWORD` | A strong private password |

6. Apply the Blueprint and wait for the deployment to finish.
7. Open the generated `onrender.com` address.

The first request after a period of inactivity can take about one minute because Render Free sleeps after 15 minutes without traffic.

## 5. Test the website

1. Log in using the teacher email and password entered on Render.
2. Register a test student with a phone number and HSK level.
3. Approve that student from the teacher dashboard.
4. Upload a compressed MP4 under 100 MB.
5. Log in as the student and confirm the lesson appears only at the selected HSK level.

## Important free-tier limits

- Render Free uses a temporary local filesystem. This edition does not depend on it.
- Render Free sleeps after inactivity; the first page load can be slower.
- Neon Free is suitable for a small, low-traffic project and has monthly compute/storage limits.
- Cloudinary Free uses a monthly credit pool for storage, transformations, and bandwidth. Repeated video watching consumes bandwidth.
- Browser controls can discourage downloading, but no web video platform can provide perfect DRM against screen recording or advanced users.

## Updating the deployed website

After modifying files:

```powershell
git add .
git commit -m "Update platform"
git push
```

Render deploys the new version automatically. Neon data and Cloudinary videos remain intact.

## Troubleshooting

### `The server is not configured yet`
Check that `DATABASE_URL` and `CLOUDINARY_URL` exist in Render under **Environment**.

### Database connection error
Use Neon's pooled connection string and keep `?sslmode=require` at the end.

### Cloudinary upload error
Confirm that `CLOUDINARY_URL` is copied exactly and that the video is under 100 MB.

### Teacher password did not change
The teacher is created only when no teacher exists. To change an existing teacher password later, use the application's future password-change feature or reset the database intentionally.
