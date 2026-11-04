'use strict';

const assets = require('./qr-assets.json');

// Only reviewed, bundled assets bound to the exact receiving account/version
// can become payment instructions. Demo and placeholder paths remain blocked.
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
