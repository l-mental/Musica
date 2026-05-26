const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'emmfab_secret_carnaval',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 3600000 }
}));

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const RHYTHMS_FILE = path.join(DATA_DIR, 'rhythms.json');
const SCORES_FILE = path.join(DATA_DIR, 'scores.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

async function safeReadJSON(filePath, defaultData) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    if (!data.trim()) {
      await fs.writeFile(filePath, JSON.stringify(defaultData, null, 2));
      return defaultData;
    }
    return JSON.parse(data);
  } catch (err) {
    console.warn(`Error leyendo ${filePath}, recreando.`);
    await fs.writeFile(filePath, JSON.stringify(defaultData, null, 2));
    return defaultData;
  }
}

async function writeJSON(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

async function initDataFiles() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(UPLOADS_DIR, { recursive: true });

  const defaultUsers = [
    { id: 1, username: 'EMMFAB', password: '2026', role: 'user' },
    { id: 2, username: 'admin', password: 'admin123', role: 'admin' }
  ];
  await safeReadJSON(USERS_FILE, defaultUsers);

  const defaultRhythms = [
    { id: 1, name: 'Morenada' }, { id: 2, name: 'Diablada' }, { id: 3, name: 'Cacharpaya' },
    { id: 4, name: 'Huayño' }, { id: 5, name: 'Tinkus' }, { id: 6, name: 'Cullaguada' },
    { id: 7, name: 'Llamerada' }, { id: 8, name: 'Incas' }, { id: 9, name: 'Tobas' },
    { id: 10, name: 'Wacawaca' }, { id: 11, name: 'Pujllay' }, { id: 12, name: 'Mineros' },
    { id: 13, name: 'Potolos' }, { id: 14, name: 'Caporal' }, { id: 15, name: 'Salay' },
    { id: 16, name: 'Cueca' }, { id: 17, name: 'Taquirari' }, { id: 18, name: 'Chobena' },
    { id: 19, name: 'Polka' }, { id: 20, name: 'Guaracha' }, { id: 21, name: 'Merengue' },
    { id: 22, name: 'Rock' }, { id: 23, name: 'Cumbia' }, { id: 24, name: 'Shake' },
    { id: 25, name: 'Balada' }, { id: 26, name: 'Bolero' }, { id: 27, name: 'Vals' },
    { id: 28, name: 'Chuntunqui' }, { id: 29, name: 'Huaycheños' }, { id: 30, name: 'Huaylas' },
    { id: 31, name: 'Villancicos navideños' }, { id: 32, name: 'Varios' },
    { id: 33, name: 'Llevadas' }, { id: 34, name: 'Marcha fúnebre' }
  ];
  await safeReadJSON(RHYTHMS_FILE, defaultRhythms);
  await safeReadJSON(SCORES_FILE, []);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + file.originalname;
    cb(null, unique);
  }
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Solo PDF'), false);
  }
});

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin')
    return res.status(403).send('Acceso denegado. Solo administrador.');
  next();
}

// RUTAS
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const users = await safeReadJSON(USERS_FILE, []);
  const user = users.find(u => u.username === username && u.password === password);
  if (user) {
    req.session.user = { id: user.id, username: user.username, role: user.role };
    res.redirect('/');
  } else {
    res.render('login', { error: 'Credenciales inválidas' });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

app.get('/', requireLogin, async (req, res) => {
  try {
    const rhythms = await safeReadJSON(RHYTHMS_FILE, []);
    let scores = await safeReadJSON(SCORES_FILE, []);
    const rhythmMap = Object.fromEntries(rhythms.map(r => [r.id, r.name]));
    scores = scores.map(s => ({
      ...s,
      rhythm_name: rhythmMap[s.rhythm_id] || 'Sin ritmo',
      instrument: s.instrument || 'ambos'
    }));

    const { rhythm, instrument } = req.query;
    let filteredScores = [...scores];
    if (rhythm) {
      const rhythmId = rhythms.find(r => r.name === rhythm)?.id;
      if (rhythmId) filteredScores = filteredScores.filter(s => s.rhythm_id === rhythmId);
    }
    if (instrument && instrument !== 'todos') {
      filteredScores = filteredScores.filter(s => s.instrument === instrument || s.instrument === 'ambos');
    }

    res.render('index', {
      scores: filteredScores,
      rhythms,
      selectedRhythm: rhythm || '',
      selectedInstrument: instrument || 'todos',
      isAdmin: req.session.user.role === 'admin'
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error cargando datos');
  }
});

app.get('/download/:id', requireLogin, async (req, res) => {
  const scores = await safeReadJSON(SCORES_FILE, []);
  const score = scores.find(s => s.id == req.params.id);
  if (!score) return res.status(404).send('Partitura no encontrada');
  const filepath = path.join(UPLOADS_DIR, score.filename);
  if (fsSync.existsSync(filepath)) res.download(filepath);
  else res.status(404).send('Archivo no encontrado');
});

// Panel admin
app.get('/admin', requireLogin, requireAdmin, async (req, res) => {
  const rhythms = await safeReadJSON(RHYTHMS_FILE, []);
  const scores = await safeReadJSON(SCORES_FILE, []);
  res.render('admin', { rhythms, scores, error: null, success: null });
});

// Agregar ritmo
app.post('/admin/add-rhythm', requireLogin, requireAdmin, async (req, res) => {
  const { rhythmName } = req.body;
  if (!rhythmName || rhythmName.trim() === '') {
    return res.redirect('/admin?error=El nombre no puede estar vacío');
  }
  const rhythms = await safeReadJSON(RHYTHMS_FILE, []);
  if (rhythms.some(r => r.name.toLowerCase() === rhythmName.trim().toLowerCase())) {
    return res.redirect('/admin?error=Ese ritmo ya existe');
  }
  const newId = rhythms.length ? Math.max(...rhythms.map(r => r.id)) + 1 : 1;
  rhythms.push({ id: newId, name: rhythmName.trim() });
  await writeJSON(RHYTHMS_FILE, rhythms);
  res.redirect('/admin?success=Ritmo agregado correctamente');
});

// Editar ritmo
app.post('/admin/edit-rhythm/:id', requireLogin, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { newName } = req.body;
  if (!newName || newName.trim() === '') {
    return res.redirect('/admin?error=El nombre no puede estar vacío');
  }
  const rhythms = await safeReadJSON(RHYTHMS_FILE, []);
  const index = rhythms.findIndex(r => r.id === id);
  if (index === -1) return res.redirect('/admin?error=Ritmo no encontrado');
  if (rhythms.some(r => r.id !== id && r.name.toLowerCase() === newName.trim().toLowerCase())) {
    return res.redirect('/admin?error=Ya existe otro ritmo con ese nombre');
  }
  rhythms[index].name = newName.trim();
  await writeJSON(RHYTHMS_FILE, rhythms);
  res.redirect('/admin?success=Ritmo editado correctamente');
});

// Eliminar ritmo
app.post('/admin/delete-rhythm/:id', requireLogin, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  let rhythms = await safeReadJSON(RHYTHMS_FILE, []);
  const rhythmToDelete = rhythms.find(r => r.id === id);
  if (!rhythmToDelete) return res.redirect('/admin?error=Ritmo no encontrado');
  let scores = await safeReadJSON(SCORES_FILE, []);
  const hasScores = scores.some(s => s.rhythm_id === id);
  if (hasScores) {
    return res.redirect('/admin?error=No se puede eliminar el ritmo porque tiene partituras asociadas. Elimina primero las partituras.');
  }
  rhythms = rhythms.filter(r => r.id !== id);
  await writeJSON(RHYTHMS_FILE, rhythms);
  res.redirect('/admin?success=Ritmo eliminado');
});

// Subir partitura
app.post('/admin/upload-score', requireLogin, requireAdmin, upload.single('pdf'), async (req, res) => {
  const { title, rhythmId, instrument } = req.body;
  if (!req.file || !title || !rhythmId || !instrument) {
    return res.redirect('/admin?error=Complete todos los campos y seleccione un PDF');
  }
  const scores = await safeReadJSON(SCORES_FILE, []);
  const newId = scores.length ? Math.max(...scores.map(s => s.id)) + 1 : 1;
  const newScore = {
    id: newId,
    title: title.trim(),
    filename: req.file.filename,
    rhythm_id: parseInt(rhythmId),
    instrument: instrument,
    upload_date: new Date().toISOString()
  };
  scores.push(newScore);
  await writeJSON(SCORES_FILE, scores);
  res.redirect('/admin?success=Partitura subida correctamente');
});

// Editar partitura
app.post('/admin/edit-score/:id', requireLogin, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { title, rhythmId, instrument } = req.body;
  if (!title || !rhythmId || !instrument) {
    return res.redirect('/admin?error=Complete todos los campos');
  }
  let scores = await safeReadJSON(SCORES_FILE, []);
  const index = scores.findIndex(s => s.id === id);
  if (index === -1) return res.redirect('/admin?error=Partitura no encontrada');
  scores[index].title = title.trim();
  scores[index].rhythm_id = parseInt(rhythmId);
  scores[index].instrument = instrument;
  await writeJSON(SCORES_FILE, scores);
  // Redirigir a la página que originó la petición (puede ser / o /admin)
  const referer = req.headers.referer || '/admin';
  res.redirect(referer);
});

// Eliminar partitura
app.post('/admin/delete-score/:id', requireLogin, requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  let scores = await safeReadJSON(SCORES_FILE, []);
  const scoreToDelete = scores.find(s => s.id === id);
  if (!scoreToDelete) return res.redirect('/admin?error=Partitura no encontrada');
  const filepath = path.join(UPLOADS_DIR, scoreToDelete.filename);
  if (fsSync.existsSync(filepath)) fsSync.unlinkSync(filepath);
  scores = scores.filter(s => s.id !== id);
  await writeJSON(SCORES_FILE, scores);
  const referer = req.headers.referer || '/admin';
  res.redirect(referer);
});

app.get('/compose', requireLogin, requireAdmin, (req, res) => {
  res.render('compose', { error: null });
});

initDataFiles().then(() => {
  app.listen(PORT, () => {
    console.log(`✅ Servidor en http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Error crítico:', err);
  process.exit(1);
});