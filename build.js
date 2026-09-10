// Build & Packaging Script for Cloudflare Pages Deployment
// Packages src/ assets into dist/ ready for static deployment

const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;
const SRC_DIR = path.join(ROOT_DIR, 'src');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();

  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(
        path.join(src, childItemName),
        path.join(dest, childItemName)
      );
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

console.log('🚀 Iniciando compilación de Golondrinas Despiertas para Cloudflare Pages...');

// Clear / recreate dist directory
if (fs.existsSync(DIST_DIR)) {
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(DIST_DIR, { recursive: true });

// Copy all src content to dist
copyRecursiveSync(SRC_DIR, DIST_DIR);

console.log('✅ Compilación finalizada con éxito.');
console.log(`📦 Los archivos listos para Cloudflare Pages se generaron en: ${DIST_DIR}`);
