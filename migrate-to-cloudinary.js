require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const fs = require('fs').promises;
const path = require('path');

// Configurar Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Rutas a tus archivos locales
const LOCAL_DATA_DIR = path.join(__dirname, 'storage', 'data');
const LOCAL_USERS = path.join(LOCAL_DATA_DIR, 'users.json');
const LOCAL_RHYTHMS = path.join(LOCAL_DATA_DIR, 'rhythms.json');
const LOCAL_SCORES = path.join(LOCAL_DATA_DIR, 'scores.json');

// Función para subir un archivo JSON a Cloudinary
async function uploadJSON(localPath, publicId) {
  try {
    const data = await fs.readFile(localPath, 'utf8');
    const jsonData = JSON.parse(data); // validar que es JSON válido
    const buffer = Buffer.from(JSON.stringify(jsonData, null, 2), 'utf8');
    
    return new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { public_id: publicId, resource_type: 'raw', overwrite: true },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(buffer);
    });
  } catch (err) {
    console.error(`Error leyendo ${localPath}:`, err.message);
    throw err;
  }
}

async function migrate() {
  console.log('📁 Migrando datos locales a Cloudinary...');
  
  // Verificar que existan los archivos locales
  try {
    await fs.access(LOCAL_USERS);
    console.log('✅ users.json encontrado');
  } catch {
    console.log('⚠️ No se encontró users.json, se omitirá');
  }
  
  try {
    await fs.access(LOCAL_RHYTHMS);
    console.log('✅ rhythms.json encontrado');
  } catch {
    console.log('⚠️ No se encontró rhythms.json, se omitirá');
  }
  
  try {
    await fs.access(LOCAL_SCORES);
    console.log('✅ scores.json encontrado');
  } catch {
    console.log('⚠️ No se encontró scores.json, se omitirá');
  }
  
  // Subir archivos
  try {
    await uploadJSON(LOCAL_USERS, 'users');
    console.log('✅ users.json subido a Cloudinary');
  } catch (err) {
    console.error('❌ Error al subir users.json:', err.message);
  }
  
  try {
    await uploadJSON(LOCAL_RHYTHMS, 'rhythms');
    console.log('✅ rhythms.json subido a Cloudinary');
  } catch (err) {
    console.error('❌ Error al subir rhythms.json:', err.message);
  }
  
  try {
    await uploadJSON(LOCAL_SCORES, 'scores');
    console.log('✅ scores.json subido a Cloudinary');
  } catch (err) {
    console.error('❌ Error al subir scores.json:', err.message);
  }
  
  console.log('🎉 Migración completada');
}

migrate();