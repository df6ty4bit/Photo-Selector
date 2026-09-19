const express = require('express');
const { db, transaction } = require('../db');
const { getGreeting } = require('../utils/greeting');

const router = express.Router();

function requireGallerySession(req, res, next) {
  if (req.session.galleryId) return next();
  return res.redirect('/');
}

router.get('/', (req, res) => {
  res.render('client_login', { error: null });
});

router.post('/login', (req, res) => {
  const code = (req.body.code || '').trim();
  const gallery = db.prepare('SELECT * FROM galleries WHERE otp = ?').get(code);
  if (!gallery) {
    return res.render('client_login', { error: 'That code was not recognized.' });
  }
  req.session.galleryId = gallery.id;
  res.redirect('/gallery');
});

router.post('/logout', (req, res) => {
  req.session.galleryId = null;
  res.redirect('/');
});

router.get('/gallery', requireGallerySession, (req, res) => {
  const gallery = db
    .prepare('SELECT * FROM galleries WHERE id = ?')
    .get(req.session.galleryId);
  if (!gallery) {
    req.session.galleryId = null;
    return res.redirect('/');
  }

  const photos = db
    .prepare(
      `SELECT p.*, COALESCE(s.selected, 0) AS selected
       FROM photos p LEFT JOIN selections s ON s.photo_id = p.id
       WHERE p.gallery_id = ? ORDER BY p.created_at ASC`
    )
    .all(gallery.id);

  res.render('client_gallery', { gallery, photos, greeting: getGreeting() });
});

router.post('/gallery/select', requireGallerySession, (req, res) => {
  const gallery = db
    .prepare('SELECT * FROM galleries WHERE id = ?')
    .get(req.session.galleryId);
  if (!gallery) return res.status(400).json({ error: 'No gallery' });

  // selectedIds is a JSON array of photo ids the client checked.
  let selectedIds = [];
  try {
    selectedIds = Array.isArray(req.body.selectedIds) ? req.body.selectedIds : [];
  } catch (e) {
    selectedIds = [];
  }
  const selectedSet = new Set(selectedIds.map(String));

  const photoIds = db
    .prepare('SELECT id FROM photos WHERE gallery_id = ?')
    .all(gallery.id)
    .map((r) => r.id);

  const update = db.prepare('UPDATE selections SET selected = ? WHERE photo_id = ?');
  transaction(() => {
    for (const id of photoIds) {
      update.run(selectedSet.has(String(id)) ? 1 : 0, id);
    }
    db.prepare("UPDATE galleries SET submitted_at = datetime('now') WHERE id = ?").run(
      gallery.id
    );
  });

  res.json({ ok: true });
});

module.exports = router;
