require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const { v2: cloudinary } = require('cloudinary');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-before-deployment';
const DATABASE_URL = process.env.DATABASE_URL || '';
const PUBLIC_DIR = path.join(__dirname, 'public');
const LEVELS = ['HSK1', 'HSK2', 'HSK3'];
const MAX_VIDEO_MB = Math.min(Number(process.env.MAX_VIDEO_MB || 100), 100);
const MAX_VIDEO_BYTES = MAX_VIDEO_MB * 1024 * 1024;
const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || 'mis-dekhli-chinese-dz';

if (process.env.CLOUDINARY_URL) {
  cloudinary.config({ secure: true });
} else {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
  });
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL && !DATABASE_URL.includes('localhost')
    ? { rejectUnauthorized: false }
    : false,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000
});

app.use(express.json({ limit: '1mb' }));
app.use(express.static(PUBLIC_DIR));

function requireConfiguration() {
  if (!DATABASE_URL) throw new Error('DATABASE_URL is missing.');
  const config = cloudinary.config();
  if (!config.cloud_name || !config.api_key || !config.api_secret) {
    throw new Error('CLOUDINARY_URL is missing or invalid.');
  }
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    level: user.level,
    createdAt: user.created_at,
    approvedAt: user.approved_at
  };
}

function publicVideo(video) {
  return {
    id: video.id,
    title: video.title,
    description: video.description,
    level: video.level,
    originalFilename: video.original_filename,
    sizeBytes: Number(video.size_bytes || 0),
    duration: video.duration === null ? null : Number(video.duration),
    format: video.format,
    createdAt: video.created_at
  };
}

function createToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function createMediaUrl(video, user) {
  const token = jwt.sign(
    { type: 'media', videoId: video.id, userId: user.id },
    JWT_SECRET,
    { expiresIn: '2h' }
  );
  return `/api/videos/${video.id}/stream?token=${encodeURIComponent(token)}`;
}

async function findUserById(id) {
  const result = await pool.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
  return result.rows[0] || null;
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ message: 'Authentication required.' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await findUserById(payload.id);
    if (!user) return res.status(401).json({ message: 'Account no longer exists.' });
    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error.message);
    return res.status(401).json({ message: 'Your session is invalid or expired.' });
  }
}

function requireTeacher(req, res, next) {
  if (req.user.role !== 'teacher') {
    return res.status(403).json({ message: 'Teacher access required.' });
  }
  next();
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizePhone(value) {
  const phone = String(value || '').trim().replace(/[\s().-]/g, '');
  return /^\+?\d{8,15}$/.test(phone) ? phone : null;
}

function normalizeLevel(value) {
  const level = String(value || '').toUpperCase().replace(/\s+/g, '');
  return LEVELS.includes(level) ? level : null;
}

function cleanFilename(value) {
  return path.basename(String(value || 'video')).replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 180);
}

function cloudinaryReady() {
  const config = cloudinary.config();
  return Boolean(config.cloud_name && config.api_key && config.api_secret);
}

async function initializeDatabase() {
  requireConfiguration();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      email VARCHAR(254) UNIQUE NOT NULL,
      phone VARCHAR(20),
      password_hash TEXT NOT NULL,
      role VARCHAR(20) NOT NULL CHECK (role IN ('teacher', 'student')),
      status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'approved')),
      level VARCHAR(10) CHECK (level IS NULL OR level IN ('HSK1', 'HSK2', 'HSK3')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      approved_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS videos (
      id UUID PRIMARY KEY,
      title VARCHAR(120) NOT NULL,
      description VARCHAR(500) NOT NULL DEFAULT '',
      level VARCHAR(10) NOT NULL CHECK (level IN ('HSK1', 'HSK2', 'HSK3')),
      original_filename VARCHAR(180) NOT NULL,
      cloudinary_public_id TEXT UNIQUE NOT NULL,
      cloudinary_version BIGINT,
      format VARCHAR(20),
      size_bytes BIGINT NOT NULL DEFAULT 0,
      duration DOUBLE PRECISION,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS users_role_status_idx ON users(role, status);
    CREATE INDEX IF NOT EXISTS videos_level_created_idx ON videos(level, created_at DESC);
  `);

  const existingTeacher = await pool.query("SELECT id FROM users WHERE role = 'teacher' LIMIT 1");
  if (existingTeacher.rowCount === 0) {
    const email = String(process.env.TEACHER_EMAIL || 'teacher@misdekhli.dz').trim().toLowerCase();
    const password = process.env.TEACHER_PASSWORD || 'Teacher123!';
    const passwordHash = await bcrypt.hash(password, 12);
    await pool.query(
      `INSERT INTO users (id, name, email, phone, password_hash, role, status, level)
       VALUES ($1, $2, $3, NULL, $4, 'teacher', 'approved', NULL)`,
      [crypto.randomUUID(), process.env.TEACHER_NAME || 'Mis Dekhli Teacher', email, passwordHash]
    );
    console.log(`Teacher account created for ${email}`);
  }
}

let startupError = null;
const databaseReady = initializeDatabase().catch((error) => {
  startupError = error;
  console.error('Startup configuration error:', error);
});

app.use('/api', async (_req, res, next) => {
  await databaseReady;
  if (startupError) {
    return res.status(503).json({ message: 'The server is not configured yet. Check DATABASE_URL and CLOUDINARY_URL.' });
  }
  next();
});

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, app: 'Mis Dekhli Chinese DZ', database: 'Neon', media: 'Cloudinary' });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({ ok: false, message: 'Database is unavailable.' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const body = req.body || {};
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const phone = normalizePhone(body.phone);
  const password = String(body.password || '');
  const level = normalizeLevel(body.level);

  if (name.length < 2 || name.length > 80) {
    return res.status(400).json({ message: 'Name must contain 2 to 80 characters.' });
  }
  if (!validEmail(email)) {
    return res.status(400).json({ message: 'Enter a valid email address.' });
  }
  if (!phone) {
    return res.status(400).json({ message: 'Enter a valid phone number with 8 to 15 digits.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ message: 'Password must contain at least 8 characters.' });
  }
  if (!level) {
    return res.status(400).json({ message: 'Choose HSK1, HSK2, or HSK3.' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (id, name, email, phone, password_hash, role, status, level)
       VALUES ($1, $2, $3, $4, $5, 'student', 'pending', $6)
       RETURNING *`,
      [crypto.randomUUID(), name, email, phone, passwordHash, level]
    );
    res.status(201).json({
      message: 'Registration received. Your teacher must approve your account.',
      user: publicUser(result.rows[0])
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'An account already uses this email.' });
    }
    throw error;
  }
});

app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const result = await pool.query('SELECT * FROM users WHERE email = $1 LIMIT 1', [email]);
  const user = result.rows[0];

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ message: 'Incorrect email or password.' });
  }

  res.json({ token: createToken(user), user: publicUser(user) });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.get('/api/student/videos', requireAuth, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ message: 'Student access required.' });
  }
  if (req.user.status !== 'approved') {
    return res.status(403).json({ message: 'Your account is waiting for teacher approval.', status: req.user.status });
  }

  const result = await pool.query(
    'SELECT * FROM videos WHERE level = $1 ORDER BY created_at DESC',
    [req.user.level]
  );
  const videos = result.rows.map((video) => ({
    ...publicVideo(video),
    streamUrl: createMediaUrl(video, req.user)
  }));
  res.json({ level: req.user.level, videos });
});

app.get('/api/videos/:id/stream', async (req, res) => {
  const token = String(req.query.token || '');
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).send('This video link is invalid or expired. Refresh the lessons page.');
  }

  if (payload.type !== 'media' || payload.videoId !== req.params.id) {
    return res.status(403).send('Video access denied.');
  }

  const [userResult, videoResult] = await Promise.all([
    pool.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [payload.userId]),
    pool.query('SELECT * FROM videos WHERE id = $1 LIMIT 1', [req.params.id])
  ]);
  const user = userResult.rows[0];
  const video = videoResult.rows[0];
  if (!user || !video) return res.status(404).send('Video not found.');

  const allowedTeacher = user.role === 'teacher';
  const allowedStudent = user.role === 'student' && user.status === 'approved' && user.level === video.level;
  if (!allowedTeacher && !allowedStudent) return res.status(403).send('Video access denied.');

  const deliveryUrl = cloudinary.url(video.cloudinary_public_id, {
    resource_type: 'video',
    type: 'authenticated',
    secure: true,
    sign_url: true,
    version: video.cloudinary_version || undefined,
    format: video.format || undefined
  });
  res.set('Cache-Control', 'private, no-store');
  return res.redirect(302, deliveryUrl);
});

app.get('/api/teacher/dashboard', requireAuth, requireTeacher, async (_req, res) => {
  const [studentsResult, videosResult] = await Promise.all([
    pool.query("SELECT * FROM users WHERE role = 'student' ORDER BY created_at DESC"),
    pool.query('SELECT * FROM videos ORDER BY created_at DESC')
  ]);
  const students = studentsResult.rows.map(publicUser);
  const videos = videosResult.rows.map(publicVideo);
  const stats = {
    totalStudents: students.length,
    pendingStudents: students.filter((student) => student.status === 'pending').length,
    approvedStudents: students.filter((student) => student.status === 'approved').length,
    totalVideos: videos.length
  };
  res.json({ stats, students, videos });
});

app.patch('/api/teacher/students/:id/approve', requireAuth, requireTeacher, async (req, res) => {
  const result = await pool.query(
    `UPDATE users SET status = 'approved', approved_at = NOW()
     WHERE id = $1 AND role = 'student'
     RETURNING *`,
    [req.params.id]
  );
  const student = result.rows[0];
  if (!student) return res.status(404).json({ message: 'Student not found.' });
  res.json({ message: `${student.name} has been approved.`, student: publicUser(student) });
});

app.delete('/api/teacher/students/:id', requireAuth, requireTeacher, async (req, res) => {
  const result = await pool.query(
    "DELETE FROM users WHERE id = $1 AND role = 'student' RETURNING name",
    [req.params.id]
  );
  const student = result.rows[0];
  if (!student) return res.status(404).json({ message: 'Student not found.' });
  res.json({ message: `${student.name} has been removed.` });
});

app.post('/api/teacher/videos/signature', requireAuth, requireTeacher, (_req, res) => {
  if (!cloudinaryReady()) {
    return res.status(503).json({ message: 'Cloudinary is not configured.' });
  }
  const timestamp = Math.round(Date.now() / 1000);
  const paramsToSign = { folder: CLOUDINARY_FOLDER, timestamp, type: 'authenticated' };
  const config = cloudinary.config();
  const signature = cloudinary.utils.api_sign_request(paramsToSign, config.api_secret);
  res.json({
    timestamp,
    signature,
    folder: CLOUDINARY_FOLDER,
    type: 'authenticated',
    cloudName: config.cloud_name,
    apiKey: config.api_key,
    maxVideoBytes: MAX_VIDEO_BYTES,
    maxVideoMb: MAX_VIDEO_MB
  });
});

app.post('/api/teacher/videos', requireAuth, requireTeacher, async (req, res) => {
  const title = String(req.body?.title || '').trim();
  const description = String(req.body?.description || '').trim();
  const level = normalizeLevel(req.body?.level);
  const publicId = String(req.body?.publicId || '').trim();
  const originalFilename = cleanFilename(req.body?.originalFilename);

  if (title.length < 2 || title.length > 120) {
    return res.status(400).json({ message: 'Video title must contain 2 to 120 characters.' });
  }
  if (!level) return res.status(400).json({ message: 'Choose a valid HSK level.' });
  if (description.length > 500) {
    return res.status(400).json({ message: 'Description cannot exceed 500 characters.' });
  }
  if (!publicId || !publicId.startsWith(`${CLOUDINARY_FOLDER}/`)) {
    return res.status(400).json({ message: 'The uploaded video is invalid.' });
  }

  let asset;
  try {
    asset = await cloudinary.api.resource(publicId, {
      resource_type: 'video',
      type: 'authenticated'
    });
  } catch (error) {
    console.error('Cloudinary verification failed:', error);
    return res.status(400).json({ message: 'Cloudinary could not verify the uploaded video.' });
  }

  if (Number(asset.bytes || 0) > MAX_VIDEO_BYTES) {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'video', type: 'authenticated', invalidate: true });
    return res.status(413).json({ message: `Video is too large. Maximum size is ${MAX_VIDEO_MB} MB.` });
  }

  try {
    const result = await pool.query(
      `INSERT INTO videos (
        id, title, description, level, original_filename, cloudinary_public_id,
        cloudinary_version, format, size_bytes, duration
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *`,
      [
        crypto.randomUUID(), title, description, level, originalFilename,
        publicId, asset.version || null, asset.format || null,
        Number(asset.bytes || 0), asset.duration === undefined ? null : Number(asset.duration)
      ]
    );
    res.status(201).json({ message: 'Video uploaded successfully.', video: publicVideo(result.rows[0]) });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'This video has already been added.' });
    }
    throw error;
  }
});

app.delete('/api/teacher/videos/:id', requireAuth, requireTeacher, async (req, res) => {
  const result = await pool.query('DELETE FROM videos WHERE id = $1 RETURNING *', [req.params.id]);
  const video = result.rows[0];
  if (!video) return res.status(404).json({ message: 'Video not found.' });

  try {
    await cloudinary.uploader.destroy(video.cloudinary_public_id, {
      resource_type: 'video',
      type: 'authenticated',
      invalidate: true
    });
  } catch (error) {
    console.error('Cloudinary delete warning:', error);
  }
  res.json({ message: `${video.title} has been removed.` });
});

app.use((error, req, res, next) => {
  console.error(error);
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ message: 'An unexpected server error occurred.' });
  }
  next(error);
});

app.use((_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Mis Dekhli Chinese DZ is running on port ${PORT}`);
  console.log('Database: Neon PostgreSQL');
  console.log('Video storage: Cloudinary authenticated assets');
});
