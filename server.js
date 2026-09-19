require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');

const { db } = require('./db');
const adminRoutes = require('./routes/admin');
const clientRoutes = require('./routes/client');

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET) {
  console.error(
    'Missing ADMIN_PASSWORD or SESSION_SECRET. Copy .env.example to .env and fill it in first.'
  );
  process.exit(1);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 14, // 14 days
    },
  })
);

// Protected preview image serving: a smaller, compressed JPEG used by the
// client-facing gallery so photos load quickly. Same access rule as originals.
app.get('/uploads/:galleryId/previews/:filename', (req, res) => {
  const { galleryId, filename } = req.params;
  const isAdmin = !!req.session.isAdmin;
  const isClientForThisGallery =
    req.session.galleryId && String(req.session.galleryId) === String(galleryId);

  if (!isAdmin && !isClientForThisGallery) {
    return res.status(403).send('Forbidden');
  }

  const filePath = path.join(__dirname, 'uploads', galleryId, 'previews', filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.sendFile(filePath);
});

// Protected image serving: only the admin, or a client logged into that
// specific gallery, can fetch an image file.
app.get('/uploads/:galleryId/:filename', (req, res) => {
  const { galleryId, filename } = req.params;
  const isAdmin = !!req.session.isAdmin;
  const isClientForThisGallery =
    req.session.galleryId && String(req.session.galleryId) === String(galleryId);

  if (!isAdmin && !isClientForThisGallery) {
    return res.status(403).send('Forbidden');
  }

  const filePath = path.join(__dirname, 'uploads', galleryId, filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.sendFile(filePath);
});

app.use('/admin', adminRoutes);
app.use('/', clientRoutes);

app.listen(PORT, () => {
  console.log(`Photo selector running at http://localhost:${PORT}`);
  console.log(`Admin login at http://localhost:${PORT}/admin/login`);
});
