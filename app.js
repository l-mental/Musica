const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de vistas
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middlewares
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'emmfab_secret_carnaval',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 3600000 }
}));

// Rutas de archivos de datos
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const RHYTHMS_FILE = path.join(DATA_DIR, 'rhythms.json');
const SCORES_FILE = path.join(DATA_DIR, 'scores.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Función segura para leer JSON
async function safeReadJSON(filePath, defaultData) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    if (!data.trim()) {
      await fs.writeFile(filePath, JSON.stringify(defaultData, null, 2));
      return defaultData;
    }
    return JSON.parse(data);
  } catch (err) {
    console.warn(`Error leyendo ${filePath}, recreando archivo.`);
    await fs.writeFile(filePath, JSON.stringify(defaultData, null, 2));
    return defaultData;
  }
}

async function writeJSON(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

// Inicializar archivos con datos por defecto
async function initDataFiles() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(UPLOADS_DIR, { recursive: true });

  const defaultUsers = [
    { id: 1, username: 'EMMFAB', password: '2026', role: 'user' },
    { id: 2, username: 'admin', password: 'admin123', role: 'admin' }
  ];
  await safeReadJSON(USERS_FILE, defaultUsers);

  const defaultRhythms = [
    { id: 1, name: 'Morenada' },
    { id: 2, name: 'Cullahuada' },
    { id: 3, name: 'Tinkus' },
    { id: 4, name: 'Diablada' }
  ];
  await safeReadJSON(RHYTHMS_FILE, defaultRhythms);

  await safeReadJSON(SCORES_FILE, []);
}

// Configuración de subida de PDFs
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
    else cb(new Error('Solo se permiten PDF'), false);
  }
});

// Middlewares de autenticación
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin')
    return res.status(403).send('Acceso denegado. Solo el administrador.');
  next();
}

// Rutas públicas
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
    res.render('login', { error: 'Usuario o contraseña incorrectos' });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// Página principal con filtros (ritmo + especialidad)
app.get('/', requireLogin, async (req, res) => {
  try {
    const rhythms = await safeReadJSON(RHYTHMS_FILE, []);
    let scores = await safeReadJSON(SCORES_FILE, []);
    const rhythmMap = Object.fromEntries(rhythms.map(r => [r.id, r.name]));
    scores = scores.map(s => ({
      ...s,
      rhythm_name: rhythmMap[s.rhythm_id] || 'Sin ritmo',
      instrument: s.instrument || 'ambos'   // compatibilidad
    }));

    const { rhythm, instrument } = req.query;
    if (rhythm) {
      const rhythmId = rhythms.find(r => r.name === rhythm)?.id;
      if (rhythmId) scores = scores.filter(s => s.rhythm_id === rhythmId);
    }
    if (instrument && instrument !== 'todos') {
      scores = scores.filter(s => s.instrument === instrument || s.instrument === 'ambos');
    }

    res.render('index', {
      scores,
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

// Descarga de PDF
app.get('/download/:id', requireLogin, async (req, res) => {
  const scores = await safeReadJSON(SCORES_FILE, []);
  const score = scores.find(s => s.id == req.params.id);
  if (!score) return res.status(404).send('Partitura no encontrada');
  const filepath = path.join(UPLOADS_DIR, score.filename);
  if (fsSync.existsSync(filepath)) res.download(filepath);
  else res.status(404).send('Archivo PDF no encontrado');
});

// Panel de administración
app.get('/admin', requireLogin, requireAdmin, async (req, res) => {
  const rhythms = await safeReadJSON(RHYTHMS_FILE, []);
  const scores = await safeReadJSON(SCORES_FILE, []);
  res.render('admin', { rhythms, scores, error: null, success: null });
});

// Agregar ritmo (solo admin)
app.post('/admin/add-rhythm', requireLogin, requireAdmin, async (req, res) => {
  const { rhythmName } = req.body;
  if (!rhythmName || rhythmName.trim() === '') {
    const rhythms = await safeReadJSON(RHYTHMS_FILE, []);
    const scores = await safeReadJSON(SCORES_FILE, []);
    return res.render('admin', { rhythms, scores, error: 'El nombre no puede estar vacío', success: null });
  }
  const rhythms = await safeReadJSON(RHYTHMS_FILE, []);
  if (rhythms.some(r => r.name.toLowerCase() === rhythmName.trim().toLowerCase())) {
    const scores = await safeReadJSON(SCORES_FILE, []);
    return res.render('admin', { rhythms, scores, error: 'Ese ritmo ya existe', success: null });
  }
  const newId = rhythms.length ? Math.max(...rhythms.map(r => r.id)) + 1 : 1;
  rhythms.push({ id: newId, name: rhythmName.trim() });
  await writeJSON(RHYTHMS_FILE, rhythms);
  res.redirect('/admin');
});

// Subir nueva partitura (solo admin) con instrumento
app.post('/admin/upload-score', requireLogin, requireAdmin, upload.single('pdf'), async (req, res) => {
  const { title, rhythmId, instrument } = req.body;
  if (!req.file || !title || !rhythmId || !instrument) {
    const rhythms = await safeReadJSON(RHYTHMS_FILE, []);
    const scores = await safeReadJSON(SCORES_FILE, []);
    return res.render('admin', { rhythms, scores, error: 'Debe completar título, ritmo, instrumento y seleccionar PDF', success: null });
  }
  const scores = await safeReadJSON(SCORES_FILE, []);
  const newId = scores.length ? Math.max(...scores.map(s => s.id)) + 1 : 1;
  scores.push({
    id: newId,
    title: title.trim(),
    filename: req.file.filename,
    rhythm_id: parseInt(rhythmId),
    instrument: instrument,
    upload_date: new Date().toISOString()
  });
  await writeJSON(SCORES_FILE, scores);
  res.redirect('/admin');
});

// Editor de partituras (compose)
app.get('/compose', requireLogin, requireAdmin, (req, res) => {
  res.render('compose', { error: null });
});

// Iniciar servidor
initDataFiles().then(() => {
  app.listen(PORT, () => {
    console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
    console.log(`📁 Datos guardados en carpeta 'data' y 'uploads'`);
  });
}).catch(err => {
  console.error('Error crítico:', err);
  process.exit(1);
});