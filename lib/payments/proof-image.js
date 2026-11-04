'use strict';

const sharp = require('sharp');
const { createHash } = require('node:crypto');
const { PaymentError, requireCondition } = require('./errors');
const INPUT_BYTES = 512 * 1024;
const OUTPUT_BYTES = 300 * 1024;
const DOCUMENT_BYTES = 420 * 1024;

async function validateProof(base64) {
  requireCondition(typeof base64 === 'string' && base64.length <= Math.ceil(INPUT_BYTES / 3) * 4 &&
    base64.length > 0 && base64.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(base64),
  'INVALID_IMAGE', 'Choose a JPG, PNG or WEBP image and compress it below 512 KB.');
  const input = Buffer.from(base64, 'base64');
  requireCondition(input.length <= INPUT_BYTES && input.toString('base64') === base64,
    'INVALID_IMAGE', 'The image encoding is invalid or too large.');
  try {
    const image = sharp(input, { limitInputPixels:16000000, failOn:'warning' });
    const metadata = await image.metadata();
    requireCondition(['jpeg','png','webp'].includes(metadata.format) && (metadata.pages || 1) === 1 &&
      metadata.width >= 64 && metadata.height >= 64,
    'INVALID_IMAGE', 'Use a still JPG, PNG or WEBP image at least 64 pixels wide and tall.');
    // Full decode/re-encode rejects corrupt content and strips EXIF/location metadata by default.
    const { data, info } = await image.rotate().resize({ width:1600, height:1600, fit:'inside', withoutEnlargement:true })
      .flatten({ background:'#ffffff' }).jpeg({ quality:85 }).timeout({ seconds:5 }).toBuffer({ resolveWithObject:true });
    requireCondition(data.length <= OUTPUT_BYTES, 'IMAGE_TOO_LARGE',
      'This image is too detailed to store safely. Crop to the receipt and try again; keep all payment details readable.', 413);
    return { base64:data.toString('base64'), mime:'image/jpeg', width:info.width, height:info.height,
      bytes:data.length, sha256:createHash('sha256').update(data).digest('hex'),
      inputHash:createHash('sha256').update(input).digest('hex'), validationStatus:'validated' };
  } catch (error) {
    if (error instanceof PaymentError) throw error;
    throw new PaymentError('INVALID_IMAGE', 'The image cannot be safely decoded. Choose a clear, still JPG, PNG or WEBP image.');
  }
}

module.exports = { validateProof, INPUT_BYTES, OUTPUT_BYTES, DOCUMENT_BYTES };
