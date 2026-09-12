/* Shared Cloudinary uploader — signed upload via the raw REST API, no SDK
   dependency, just fetch + a SHA-1 signature per Cloudinary's auth scheme.
   Used by both the admin product-image uploader (api/admin/products.js)
   and the public payment-receipt uploader (api/orders.js?action=upload-
   receipt) — pulled out here so the same signing logic isn't duplicated
   between an authenticated and a public upload path.
   Requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET. */

async function uploadToCloudinary(buffer, mime, publicId, folder) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Image storage is not configured (missing Cloudinary env vars).');
  }

  const crypto = require('crypto');
  const timestamp = Math.floor(Date.now() / 1000);
  folder = folder || 'products';
  // Cloudinary signs the alphabetically-sorted param string, excluding file/api_key/signature themselves.
  const toSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash('sha1').update(toSign).digest('hex');

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mime }));
  form.append('api_key', apiKey);
  form.append('timestamp', String(timestamp));
  form.append('signature', signature);
  form.append('folder', folder);
  form.append('public_id', publicId);

  const resp = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: form
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || 'Cloudinary upload failed.');
  return data.secure_url;
}

module.exports = { uploadToCloudinary };
