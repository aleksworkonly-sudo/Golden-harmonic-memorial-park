'use strict';

const assets = require('./qr-assets.json');

// Only reviewed, bundled assets can become payment instructions. The supplied
// image is a confirmed placeholder and must never pass this gate.
function receivingQr(account, registry = assets, accountId) {
  const asset = registry[account?.qrAssetId];
  if (!asset || asset.verified !== true || account.qrVerified !== true ||
      asset.channel !== account.channel || asset.accountName !== account.accountName ||
      typeof accountId !== 'string' || asset.receivingAccountId !== accountId ||
      asset.accountNumber !== account.accountNumber || asset.receivingAccountVersion !== account.version ||
      !/^\/payment-qr\/[a-z0-9-]+\.(png|jpg|webp)$/.test(asset.imagePath) ||
      /placeholder|demo/i.test(asset.imagePath)) return null;
  return { imagePath: asset.imagePath, accountName: asset.accountName };
}

module.exports = { receivingQr };
