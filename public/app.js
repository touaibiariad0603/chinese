const API = '/api';
const TOKEN_KEY = 'mis_dekhli_token';

const state = {
  token: localStorage.getItem(TOKEN_KEY),
  user: null,
  dashboard: null,
  confirmAction: null
};

const el = (id) => document.getElementById(id);
const authView = el('authView');
const studentView = el('studentView');
const teacherView = el('teacherView');
const logoutButton = el('logoutButton');
const sessionBadge = el('sessionBadge');

function setLoading(button, loading, label = 'Working...') {
  if (!button) return;
  if (loading) {
    button.dataset.original = button.innerHTML;
    button.innerHTML = `<span>${label}</span>`;
    button.disabled = true;
  } else {
    button.innerHTML = button.dataset.original || button.innerHTML;
    button.disabled = false;
  }
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  el('toastRegion').appendChild(toast);
  setTimeout(() => toast.remove(), 3800);
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  const response = await fetch(`${API}${path}`, { ...options, headers });
  let data = {};
  try { data = await response.json(); } catch { /* no JSON body */ }

  if (response.status === 401 && state.token) {
    logout(false);
    throw new Error(data.message || 'Your session expired.');
  }
  if (!response.ok) throw new Error(data.message || 'Something went wrong.');
  return data;
}

function uploadToCloudinary(file, signatureData, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    form.append('api_key', signatureData.apiKey);
    form.append('timestamp', String(signatureData.timestamp));
    form.append('signature', signatureData.signature);
    form.append('folder', signatureData.folder);
    form.append('type', signatureData.type);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${encodeURIComponent(signatureData.cloudName)}/video/upload`);
    xhr.responseType = 'json';
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });
    xhr.addEventListener('load', () => {
      const data = xhr.response || {};
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error?.message || 'Cloudinary upload failed.'));
    });
    xhr.addEventListener('error', () => reject(new Error('The video upload was interrupted. Check your internet connection.')));
    xhr.addEventListener('abort', () => reject(new Error('The video upload was cancelled.')));
    xhr.send(form);
  });
}

async function uploadVideo(file, metadata, onProgress) {
  const signatureData = await request('/teacher/videos/signature', { method: 'POST' });
  if (file.size > signatureData.maxVideoBytes) {
    throw new Error(`Video is too large. Maximum size is ${signatureData.maxVideoMb} MB.`);
  }

  const uploaded = await uploadToCloudinary(file, signatureData, onProgress);
  return request('/teacher/videos', {
    method: 'POST',
    body: JSON.stringify({
      ...metadata,
      publicId: uploaded.public_id,
      originalFilename: file.name
    })
  });
}

function showView(view) {
  authView.classList.toggle('hidden', view !== 'auth');
  studentView.classList.toggle('hidden', view !== 'student');
  teacherView.classList.toggle('hidden', view !== 'teacher');
  const signedIn = view !== 'auth';
  logoutButton.classList.toggle('hidden', !signedIn);
  sessionBadge.classList.toggle('hidden', !signedIn);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((button) => {
    button.classList.toggle('active', button.dataset.authTab === tab);
  });
  el('loginForm').classList.toggle('hidden', tab !== 'login');
  el('registerForm').classList.toggle('hidden', tab !== 'register');
}

function formatDate(iso) {
  return new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso));
}

function formatBytes(bytes) {
  const size = Number(bytes || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function escapeInitials(name) {
  return String(name || '?').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function formatMediaTime(value) {
  const totalSeconds = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function createVideoMedia(video) {
  const frame = document.createElement('div');
  frame.className = 'video-frame protected-video-frame';
  frame.tabIndex = 0;
  frame.setAttribute('aria-label', `Protected video lesson: ${video.title}`);

  const stage = document.createElement('div');
  stage.className = 'protected-video-stage';

  const player = document.createElement('video');
  player.className = 'protected-video';
  player.src = video.streamUrl;
  player.preload = 'metadata';
  player.playsInline = true;
  player.draggable = false;
  player.controls = false;
  player.disablePictureInPicture = true;
  player.disableRemotePlayback = true;
  player.setAttribute('webkit-playsinline', '');
  player.setAttribute('controlsList', 'nodownload noremoteplayback');
  player.setAttribute('disablepictureinpicture', '');
  player.setAttribute('disableremoteplayback', '');

  const shield = document.createElement('div');
  shield.className = 'video-interaction-shield';
  shield.setAttribute('aria-hidden', 'true');

  const watermark = document.createElement('div');
  watermark.className = 'video-watermark';
  watermark.textContent = `${state.user?.name || 'Student'} · Mis Dekhli Chinese DZ`;
  watermark.setAttribute('aria-hidden', 'true');

  const protectionLabel = document.createElement('div');
  protectionLabel.className = 'video-protection-label';
  protectionLabel.textContent = 'Protected lesson';
  protectionLabel.setAttribute('aria-hidden', 'true');

  const bigPlay = document.createElement('button');
  bigPlay.className = 'video-big-play';
  bigPlay.type = 'button';
  bigPlay.textContent = '▶';
  bigPlay.setAttribute('aria-label', 'Play video');

  const controls = document.createElement('div');
  controls.className = 'protected-video-controls';

  const playButton = document.createElement('button');
  playButton.className = 'video-control-button';
  playButton.type = 'button';
  playButton.textContent = '▶';
  playButton.setAttribute('aria-label', 'Play video');

  const currentTime = document.createElement('span');
  currentTime.className = 'video-time';
  currentTime.textContent = '0:00';

  const progress = document.createElement('input');
  progress.className = 'video-progress';
  progress.type = 'range';
  progress.min = '0';
  progress.max = '1000';
  progress.step = '1';
  progress.value = '0';
  progress.setAttribute('aria-label', 'Video progress');

  const duration = document.createElement('span');
  duration.className = 'video-time';
  duration.textContent = '0:00';

  const muteButton = document.createElement('button');
  muteButton.className = 'video-control-button';
  muteButton.type = 'button';
  muteButton.textContent = '🔊';
  muteButton.setAttribute('aria-label', 'Mute video');

  const volume = document.createElement('input');
  volume.className = 'video-volume';
  volume.type = 'range';
  volume.min = '0';
  volume.max = '1';
  volume.step = '0.05';
  volume.value = '1';
  volume.setAttribute('aria-label', 'Volume');

  const expandButton = document.createElement('button');
  expandButton.className = 'video-control-button';
  expandButton.type = 'button';
  expandButton.textContent = '⛶';
  expandButton.setAttribute('aria-label', 'Expand video');

  controls.append(playButton, currentTime, progress, duration, muteButton, volume, expandButton);
  stage.append(player, shield, watermark, protectionLabel, bigPlay);
  frame.append(stage, controls);

  let previousVolume = 1;

  const updatePlaybackUi = () => {
    const playing = !player.paused && !player.ended;
    playButton.textContent = playing ? '❚❚' : '▶';
    playButton.setAttribute('aria-label', playing ? 'Pause video' : 'Play video');
    bigPlay.classList.toggle('hidden', playing);
    bigPlay.textContent = player.ended ? '↻' : '▶';
    bigPlay.setAttribute('aria-label', player.ended ? 'Replay video' : 'Play video');
  };

  const updateTimeUi = () => {
    currentTime.textContent = formatMediaTime(player.currentTime);
    duration.textContent = formatMediaTime(player.duration);
    progress.value = Number.isFinite(player.duration) && player.duration > 0
      ? String(Math.round((player.currentTime / player.duration) * 1000))
      : '0';
  };

  const togglePlayback = async () => {
    try {
      if (player.paused || player.ended) await player.play();
      else player.pause();
    } catch {
      showToast('The video could not start. Tap play again.', 'error');
    }
  };

  const closeExpanded = () => {
    if (!frame.classList.contains('video-expanded')) return;
    frame.classList.remove('video-expanded');
    document.body.classList.remove('video-player-open');
    expandButton.textContent = '⛶';
    expandButton.setAttribute('aria-label', 'Expand video');
  };

  const toggleExpanded = () => {
    const opening = !frame.classList.contains('video-expanded');
    document.querySelectorAll('.video-frame.video-expanded').forEach((other) => {
      if (other !== frame) other.classList.remove('video-expanded');
    });
    frame.classList.toggle('video-expanded', opening);
    document.body.classList.toggle('video-player-open', opening);
    expandButton.textContent = opening ? '✕' : '⛶';
    expandButton.setAttribute('aria-label', opening ? 'Close expanded video' : 'Expand video');
  };

  bigPlay.addEventListener('click', (event) => {
    event.stopPropagation();
    togglePlayback();
  });
  playButton.addEventListener('click', togglePlayback);
  stage.addEventListener('click', (event) => {
    if (event.target !== bigPlay) togglePlayback();
  });
  progress.addEventListener('input', () => {
    if (Number.isFinite(player.duration) && player.duration > 0) {
      player.currentTime = (Number(progress.value) / 1000) * player.duration;
    }
  });
  muteButton.addEventListener('click', () => {
    if (player.muted || player.volume === 0) {
      player.muted = false;
      player.volume = previousVolume || 1;
    } else {
      previousVolume = player.volume || 1;
      player.muted = true;
    }
  });
  volume.addEventListener('input', () => {
    player.muted = false;
    player.volume = Number(volume.value);
    if (player.volume > 0) previousVolume = player.volume;
  });
  expandButton.addEventListener('click', toggleExpanded);

  player.addEventListener('loadedmetadata', updateTimeUi);
  player.addEventListener('durationchange', updateTimeUi);
  player.addEventListener('timeupdate', updateTimeUi);
  player.addEventListener('play', updatePlaybackUi);
  player.addEventListener('pause', updatePlaybackUi);
  player.addEventListener('ended', updatePlaybackUi);
  player.addEventListener('waiting', () => frame.classList.add('video-loading'));
  player.addEventListener('playing', () => frame.classList.remove('video-loading'));
  player.addEventListener('canplay', () => frame.classList.remove('video-loading'));
  player.addEventListener('volumechange', () => {
    const muted = player.muted || player.volume === 0;
    muteButton.textContent = muted ? '🔇' : '🔊';
    muteButton.setAttribute('aria-label', muted ? 'Unmute video' : 'Mute video');
    volume.value = muted ? '0' : String(player.volume);
  });
  player.addEventListener('error', () => {
    player.poster = '';
    frame.classList.remove('video-loading');
    frame.classList.add('video-error');
  });

  frame.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeExpanded();
      return;
    }
    if (event.target.matches('input, button')) return;
    if (event.key === ' ' || event.key.toLowerCase() === 'k') {
      event.preventDefault();
      togglePlayback();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      player.currentTime = Math.max(0, player.currentTime - 5);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      player.currentTime = Math.min(player.duration || player.currentTime + 5, player.currentTime + 5);
    } else if (event.key.toLowerCase() === 'm') {
      event.preventDefault();
      muteButton.click();
    }
  });

  ['contextmenu', 'dragstart', 'selectstart'].forEach((eventName) => {
    frame.addEventListener(eventName, (event) => event.preventDefault());
  });

  updatePlaybackUi();
  return frame;
}

function emptyState(symbol, title, message) {
  const box = document.createElement('div');
  box.className = 'empty-state';
  const mark = document.createElement('span'); mark.textContent = symbol;
  const heading = document.createElement('h3'); heading.textContent = title;
  const text = document.createElement('p'); text.textContent = message;
  box.append(mark, heading, text);
  return box;
}

function renderStudentVideo(video) {
  const card = document.createElement('article');
  card.className = 'video-card';
  card.appendChild(createVideoMedia(video));

  const content = document.createElement('div');
  content.className = 'video-content';
  const meta = document.createElement('div');
  meta.className = 'video-meta';
  const level = document.createElement('span'); level.className = 'level-chip'; level.textContent = video.level.replace('HSK', 'HSK ');
  const date = document.createElement('span'); date.className = 'video-date'; date.textContent = formatDate(video.createdAt);
  meta.append(level, date);
  const title = document.createElement('h3'); title.textContent = video.title;
  const description = document.createElement('p'); description.textContent = video.description || 'Video lesson for your current HSK level.';
  content.append(meta, title, description);
  card.appendChild(content);
  return card;
}

async function loadStudent() {
  showView('student');
  const levelNumber = state.user.level.replace('HSK', '');
  el('studentGreeting').textContent = `你好, ${state.user.name.split(' ')[0]}`;
  el('studentSubtitle').textContent = `${state.user.level.replace('HSK', 'HSK ')} student · Mis Dekhli Chinese DZ`;
  el('studentLevelBadge').innerHTML = `HSK<span>${levelNumber}</span>`;
  sessionBadge.textContent = `${state.user.name} · Student`;

  const pending = state.user.status !== 'approved';
  el('pendingPanel').classList.toggle('hidden', !pending);
  el('approvedPanel').classList.toggle('hidden', pending);
  if (pending) return;

  try {
    const data = await request('/student/videos');
    el('lessonHeading').textContent = `${data.level.replace('HSK', 'HSK ')} video lessons`;
    el('videoCount').textContent = `${data.videos.length} lesson${data.videos.length === 1 ? '' : 's'}`;
    const container = el('studentVideos');
    container.innerHTML = '';
    if (!data.videos.length) {
      container.appendChild(emptyState('影', 'No lessons yet', 'Your teacher has not uploaded a video for this level yet.'));
      return;
    }
    data.videos.forEach((video) => container.appendChild(renderStudentVideo(video)));
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function createStudentRow(student, pendingMode = false) {
  const row = document.createElement('article');
  row.className = 'student-row';

  const identity = document.createElement('div');
  identity.className = 'student-identity';
  const avatar = document.createElement('span'); avatar.className = 'avatar'; avatar.textContent = escapeInitials(student.name);
  const identityText = document.createElement('div');
  const name = document.createElement('strong'); name.textContent = student.name;
  const email = document.createElement('small'); email.textContent = student.email;
  const phone = document.createElement('small'); phone.className = 'student-phone'; phone.textContent = student.phone || 'No phone number';
  identityText.append(name, email, phone); identity.append(avatar, identityText);

  const level = document.createElement('span'); level.className = 'student-cell'; level.textContent = student.level.replace('HSK', 'HSK ');
  const status = document.createElement('span'); status.className = `status-chip ${student.status}`; status.textContent = student.status;
  const date = document.createElement('span'); date.className = 'student-cell student-date'; date.textContent = formatDate(student.createdAt);
  const actions = document.createElement('div'); actions.className = 'row-actions';

  if (pendingMode) {
    const approve = document.createElement('button');
    approve.className = 'icon-button approve-button';
    approve.type = 'button';
    approve.textContent = '✓ Approve';
    approve.addEventListener('click', () => approveStudent(student.id, approve));
    actions.appendChild(approve);
  }
  const remove = document.createElement('button');
  remove.className = 'icon-button';
  remove.type = 'button';
  remove.title = 'Remove student';
  remove.textContent = '✕';
  remove.addEventListener('click', () => openConfirm(
    'Remove student?',
    `${student.name} will lose access immediately. This action cannot be undone.`,
    () => removeStudent(student.id)
  ));
  actions.appendChild(remove);

  row.append(identity, level, status, date, actions);
  return row;
}

function renderPendingStudents() {
  const container = el('pendingStudents');
  container.innerHTML = '';
  const pending = state.dashboard.students.filter((student) => student.status === 'pending');
  if (!pending.length) {
    container.appendChild(emptyState('✓', 'All caught up', 'There are no registrations waiting for approval.'));
    return;
  }
  pending.forEach((student) => container.appendChild(createStudentRow(student, true)));
}

function renderAllStudents(query = '') {
  const container = el('allStudents');
  container.innerHTML = '';
  const normalized = query.trim().toLowerCase();
  const students = state.dashboard.students.filter((student) =>
    !normalized || [student.name, student.email, student.phone, student.level, student.status].some((value) => String(value || '').toLowerCase().includes(normalized))
  );
  if (!students.length) {
    container.appendChild(emptyState('学', 'No students found', normalized ? 'Try a different search.' : 'Student registrations will appear here.'));
    return;
  }
  students.forEach((student) => container.appendChild(createStudentRow(student, student.status === 'pending')));
}

function renderTeacherVideos() {
  const filter = el('videoFilter').value;
  const container = el('teacherVideos');
  container.innerHTML = '';
  const videos = state.dashboard.videos.filter((video) => filter === 'ALL' || video.level === filter);
  if (!videos.length) {
    container.appendChild(emptyState('影', 'No videos found', 'Upload a lesson or choose another level.'));
    return;
  }

  videos.forEach((video) => {
    const row = document.createElement('article');
    row.className = 'teacher-video-row';
    const thumb = document.createElement('span'); thumb.className = 'video-thumb'; thumb.textContent = '▶';
    const info = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = video.title;
    const desc = document.createElement('p');
    const details = [video.originalFilename, formatBytes(video.sizeBytes), video.description].filter(Boolean);
    desc.textContent = details.join(' · ');
    info.append(title, desc);
    const level = document.createElement('span'); level.className = 'level-chip'; level.textContent = video.level.replace('HSK', 'HSK ');
    const remove = document.createElement('button'); remove.className = 'icon-button'; remove.type = 'button'; remove.title = 'Remove video'; remove.textContent = '✕';
    remove.addEventListener('click', () => openConfirm('Remove video?', `“${video.title}” and its uploaded file will be deleted.`, () => removeVideo(video.id)));
    row.append(thumb, info, level, remove);
    container.appendChild(row);
  });
}

function updateTeacherStats() {
  const { stats } = state.dashboard;
  el('statTotalStudents').textContent = stats.totalStudents;
  el('statPending').textContent = stats.pendingStudents;
  el('statApproved').textContent = stats.approvedStudents;
  el('statVideos').textContent = stats.totalVideos;
  el('pendingTabCount').textContent = stats.pendingStudents;
}

async function loadTeacher() {
  showView('teacher');
  sessionBadge.textContent = `${state.user.name} · Teacher`;
  try {
    state.dashboard = await request('/teacher/dashboard');
    updateTeacherStats();
    renderPendingStudents();
    renderAllStudents(el('studentSearch').value);
    renderTeacherVideos();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function approveStudent(id, button) {
  setLoading(button, true, 'Approving...');
  try {
    const data = await request(`/teacher/students/${id}/approve`, { method: 'PATCH' });
    showToast(data.message);
    await loadTeacher();
  } catch (error) {
    showToast(error.message, 'error');
    setLoading(button, false);
  }
}

async function removeStudent(id) {
  try {
    const data = await request(`/teacher/students/${id}`, { method: 'DELETE' });
    showToast(data.message);
    await loadTeacher();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function removeVideo(id) {
  try {
    const data = await request(`/teacher/videos/${id}`, { method: 'DELETE' });
    showToast(data.message);
    await loadTeacher();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function switchDashboardTab(tab) {
  document.querySelectorAll('.dashboard-tab').forEach((button) => button.classList.toggle('active', button.dataset.dashboardTab === tab));
  ['pending', 'students', 'videos'].forEach((name) => el(`${name}Tab`).classList.toggle('hidden', name !== tab));
}

function openConfirm(title, message, action) {
  el('confirmTitle').textContent = title;
  el('confirmMessage').textContent = message;
  state.confirmAction = action;
  el('confirmModal').classList.remove('hidden');
}

function closeConfirm() {
  state.confirmAction = null;
  el('confirmModal').classList.add('hidden');
}

function logout(showMessage = true) {
  localStorage.removeItem(TOKEN_KEY);
  state.token = null;
  state.user = null;
  state.dashboard = null;
  showView('auth');
  switchAuthTab('login');
  if (showMessage) showToast('You have been logged out.');
}

async function bootstrap() {
  if (!state.token) {
    showView('auth');
    return;
  }
  try {
    const data = await request('/me');
    state.user = data.user;
    if (state.user.role === 'teacher') await loadTeacher();
    else await loadStudent();
  } catch (error) {
    logout(false);
    showToast(error.message, 'error');
  }
}

document.querySelectorAll('.auth-tab').forEach((button) => button.addEventListener('click', () => switchAuthTab(button.dataset.authTab)));
document.querySelectorAll('.dashboard-tab').forEach((button) => button.addEventListener('click', () => switchDashboardTab(button.dataset.dashboardTab)));

el('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  setLoading(button, true, 'Signing in...');
  try {
    const data = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: el('loginEmail').value, password: el('loginPassword').value })
    });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem(TOKEN_KEY, data.token);
    showToast(`Welcome, ${data.user.name}.`);
    if (data.user.role === 'teacher') await loadTeacher();
    else await loadStudent();
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    setLoading(button, false);
  }
});

el('registerForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  const selectedLevel = document.querySelector('input[name="level"]:checked').value;
  setLoading(button, true, 'Submitting...');
  try {
    const data = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: el('registerName').value,
        email: el('registerEmail').value,
        phone: el('registerPhone').value,
        password: el('registerPassword').value,
        level: selectedLevel
      })
    });
    showToast(data.message);
    el('loginEmail').value = el('registerEmail').value;
    el('registerForm').reset();
    switchAuthTab('login');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    setLoading(button, false);
  }
});

el('videoFile').addEventListener('change', (event) => {
  const file = event.target.files[0];
  el('selectedVideoName').textContent = file ? `${file.name} · ${formatBytes(file.size)}` : 'MP4 recommended · Maximum 100 MB';
});

el('videoForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  const file = el('videoFile').files[0];
  if (!file) {
    showToast('Choose a video from your computer.', 'error');
    return;
  }
  setLoading(button, true, 'Uploading video...');
  try {
    const data = await uploadVideo(file, {
      title: el('videoTitle').value,
      level: el('videoLevel').value,
      description: el('videoDescription').value
    }, (percent) => {
      button.innerHTML = `<span>Uploading ${percent}%</span>`;
    });
    showToast(data.message);
    event.currentTarget.reset();
    el('selectedVideoName').textContent = 'MP4 recommended · Maximum 100 MB';
    await loadTeacher();
    switchDashboardTab('videos');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    setLoading(button, false);
  }
});

el('studentSearch').addEventListener('input', (event) => renderAllStudents(event.target.value));
el('videoFilter').addEventListener('change', renderTeacherVideos);
logoutButton.addEventListener('click', () => logout(true));
el('confirmCancel').addEventListener('click', closeConfirm);
el('confirmAction').addEventListener('click', async () => {
  const action = state.confirmAction;
  closeConfirm();
  if (action) await action();
});
el('confirmModal').addEventListener('click', (event) => { if (event.target === el('confirmModal')) closeConfirm(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeConfirm(); });

bootstrap();
