const fs = require('fs');
const path = require('path');
const jimpPkg = require('jimp');

// Different Jimp major versions export things slightly differently
// (CommonJS default export vs. a named `Jimp` export). Support both.
const JimpClass = jimpPkg.Jimp || jimpPkg.default || jimpPkg;

/**
 * Generates a resized, compressed JPEG preview of an image for fast loading
 * on the client-facing selection page. The original file is left untouched
 * so the photographer always has the full-quality version.
 *
 * Uses Jimp (pure JavaScript, no native binaries) instead of a native image
 * library so this works unmodified on any platform Node.js runs on,
 * including Android/Termux, without needing libvips or a compiler toolchain.
 *
 * Written defensively against small API differences between Jimp versions
 * (e.g. exifRotate/autoOrient, resize signature, quality/write) so an upload
 * never crashes outright even if a slightly different Jimp version resolves.
 *
 * @param {string} originalPath - full path to the uploaded original file
 * @param {string} previewDir - directory to write the preview into
 * @param {string} previewFilename - filename to write (should end in .jpg)
 * @param {object} [opts]
 * @param {number} [opts.maxWidth=1600] - preview is never wider than this
 * @param {number} [opts.quality=72] - JPEG quality, 1-100
 */
async function generatePreview(originalPath, previewDir, previewFilename, opts = {}) {
  const { maxWidth = 1600, quality = 72 } = opts;

  fs.mkdirSync(previewDir, { recursive: true });
  const previewPath = path.join(previewDir, previewFilename);

  const image = await JimpClass.read(originalPath);

  // Auto-orient using EXIF data, if this Jimp version supports it. Skipped
  // harmlessly (not fatal) if the method isn't present under this version.
  try {
    if (typeof image.exifRotate === 'function') {
      image.exifRotate();
    } else if (typeof image.autoOrient === 'function') {
      await image.autoOrient();
    }
  } catch (err) {
    console.warn('Preview: EXIF auto-rotate skipped:', err.message);
  }

  const width = (image.bitmap && image.bitmap.width) || image.width || 0;
  if (width > maxWidth && typeof image.resize === 'function') {
    try {
      // Classic Jimp API: resize(width, height); AUTO keeps aspect ratio.
      const AUTO = JimpClass.AUTO !== undefined ? JimpClass.AUTO : -1;
      image.resize(maxWidth, AUTO);
    } catch (err) {
      // Newer Jimp API takes an options object instead.
      image.resize({ w: maxWidth });
    }
  }

  if (typeof image.quality === 'function') {
    image.quality(quality);
  }

  if (typeof image.writeAsync === 'function') {
    await image.writeAsync(previewPath);
  } else {
    await image.write(previewPath, { mime: 'image/jpeg', quality });
  }

  return previewPath;
}

module.exports = { generatePreview };
