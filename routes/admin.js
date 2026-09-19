const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const { db, generateOtp } = require('../db');
const { getGreeting } = require('../utils/greeting');
const { generatePreview } = require('../utils/imagePreview');

const router = express.Router();

function requireAdmin(req, res, next) {
  if (req.session.isAdmin) return next();
  return res.redirect('/admin/login');
}

// --- Auth ---

router.get('/login', (req, res) => {
  res.render('admin_login', { error: null });
});

router.post('/login', (req, res) => {
  if (req.body.password === process.env.ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.redirect('/admin');
  }
  res.render('admin_login', { error: 'Incorrect password.' });
});

router.post('/logout', (req, res) => {
  req.session.isAdmin = false;
  res.redirect('/admin/login');
});

// --- Dashboard: list galleries, create new one ---

router.get('/', requireAdmin, (req, res) => {
  const galleries = db
    .prepare(
      `SELECT g.*,
        (SELECT COUNT(*) FROM photos p WHERE p.gallery_id = g.id) AS photo_count,
        (SELECT COUNT(*) FROM selections s
           JOIN photos p ON p.id = s.photo_id
           WHERE p.gallery_id = g.id AND s.selected = 1) AS selected_count
       FROM galleries g ORDER BY g.created_at DESC`
    )
    .all();
  res.render('admin_dashboard', { galleries, greeting: getGreeting() });
});

router.post('/galleries', requireAdmin, (req, res) => {
  const name = (req.body.name || '').trim() || 'Untitled gallery';
  let otp;
  // Make sure the generated code is unique.
  do {
    otp = generateOtp();
  } while (db.prepare('SELECT 1 FROM galleries WHERE otp = ?').get(otp));

  const info = db
    .prepare('INSERT INTO galleries (name, otp) VALUES (?, ?)')
    .run(name, otp);

  fs.mkdirSync(path.join(__dirname, '..', 'uploads', String(info.lastInsertRowid)), {
    recursive: true,
  });

  res.redirect(`/admin/galleries/${info.lastInsertRowid}`);
});

router.post('/galleries/:id/regenerate-otp', requireAdmin, (req, res) => {
  let otp;
  do {
    otp = generateOtp();
  } while (db.prepare('SELECT 1 FROM galleries WHERE otp = ?').get(otp));
  db.prepare('UPDATE galleries SET otp = ? WHERE id = ?').run(otp, req.params.id);
  res.redirect(`/admin/galleries/${req.params.id}`);
});

router.post('/galleries/:id/delete', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM galleries WHERE id = ?').run(req.params.id); // cascades to photos/selections
  const dir = path.join(__dirname, '..', 'uploads', req.params.id);
  fs.rmSync(dir, { recursive: true, force: true });
  res.redirect('/admin');
});

// --- Single gallery view: upload photos, see selections, delete photos ---

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', req.params.id);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB per photo
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

router.get('/galleries/:id', requireAdmin, (req, res) => {
  const gallery = db.prepare('SELECT * FROM galleries WHERE id = ?').get(req.params.id);
  if (!gallery) return res.status(404).send('Gallery not found');

  const photos = db
    .prepare(
      `SELECT p.*, COALESCE(s.selected, 0) AS selected
       FROM photos p LEFT JOIN selections s ON s.photo_id = p.id
       WHERE p.gallery_id = ? ORDER BY p.created_at ASC`
    )
    .all(gallery.id);

  res.render('admin_gallery', { gallery, photos, greeting: getGreeting() });
});

router.post(
  '/galleries/:id/photos',
  requireAdmin,
  upload.array('photos', 100),
  async (req, res) => {
    const insert = db.prepare(
      'INSERT INTO photos (gallery_id, filename, original_name, preview_filename) VALUES (?, ?, ?, ?)'
    );
    const insertSelection = db.prepare(
      'INSERT INTO selections (photo_id, selected) VALUES (?, 0)'
    );

    const galleryDir = path.join(__dirname, '..', 'uploads', req.params.id);
    const previewDir = path.join(galleryDir, 'previews');

    for (const file of req.files || []) {
      // Try to make a lightweight, resized/compressed JPEG the client-facing
      // gallery can load instead of the full-quality original, so it loads
      // fast. If that fails for any reason, fall back to the original file
      // rather than failing the whole upload — the client route already
      // knows to use the original when there's no preview_filename.
      let previewFilename = null;
      try {
        const candidate = path.parse(file.filename).name + '.jpg';
        await generatePreview(path.join(galleryDir, file.filename), previewDir, candidate);
        previewFilename = candidate;
      } catch (err) {
        console.warn(
          `Preview generation failed for "${file.originalname}", using original instead:`,
          err.message
        );
      }

      const info = insert.run(
        req.params.id,
        file.filename,
        file.originalname,
        previewFilename
      );
      insertSelection.run(info.lastInsertRowid);
    }

    res.redirect(`/admin/galleries/${req.params.id}`);
  }
);

router.post('/galleries/:galleryId/photos/:photoId/delete', requireAdmin, (req, res) => {
  const photo = db
    .prepare('SELECT * FROM photos WHERE id = ? AND gallery_id = ?')
    .get(req.params.photoId, req.params.galleryId);
  if (photo) {
    db.prepare('DELETE FROM photos WHERE id = ?').run(photo.id); // cascades selection
    const filePath = path.join(
      __dirname,
      '..',
      'uploads',
      req.params.galleryId,
      photo.filename
    );
    fs.rm(filePath, { force: true }, () => {});
    if (photo.preview_filename) {
      const previewPath = path.join(
        __dirname,
        '..',
        'uploads',
        req.params.galleryId,
        'previews',
        photo.preview_filename
      );
      fs.rm(previewPath, { force: true }, () => {});
    }
  }
  res.redirect(`/admin/galleries/${req.params.galleryId}`);
});

module.exports = router;
