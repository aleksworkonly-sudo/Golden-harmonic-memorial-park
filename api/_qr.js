// Tiny QR code maker (SVG). Uses the MIT-licensed "QRCode for JavaScript" by Kazuhiko Arase
// (vendored from qrcode-terminal in api/_vendor/qrcode) so no extra package has to be installed.
const QRCode = require('./_vendor/qrcode');
const QRErrorCorrectLevel = require('./_vendor/qrcode/QRErrorCorrectLevel');

// Returns an <svg> string that encodes `text` (error correction M, 4-module quiet zone).
function qrSvg(text, { size = 132 } = {}) {
  const qr = new QRCode(-1, QRErrorCorrectLevel.M);
  qr.addData(String(text));
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 3;
  const total = n + quiet * 2;
  let path = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) path += 'M' + (c + quiet) + ' ' + (r + quiet) + 'h1v1h-1z';
    }
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + total + '" width="' + size + '" height="' + size + '" shape-rendering="crispEdges" role="img" aria-label="Receipt verification QR code"><rect width="100%" height="100%" fill="#fff"/><path d="' + path + '" fill="#000"/></svg>';
}
module.exports = { qrSvg };
