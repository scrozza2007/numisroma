const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');
const logger = require('./logger');

// S3 is optional. When AWS_S3_BUCKET is not set the helper functions
// return null/no-op so upload.js can fall back to local disk.
const isS3Enabled = () => !!(process.env.AWS_S3_BUCKET);

let _client;
const getClient = () => {
  if (!_client) {
    _client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      // Credentials are picked up automatically from env vars
      // (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY) or IAM role.
    });
  }
  return _client;
};

/**
 * Upload a Buffer to S3 and return the public HTTPS URL.
 * @param {Buffer} buffer
 * @param {string} key  - S3 object key, e.g. "uploads/collections/foo.webp"
 * @param {string} contentType
 * @returns {Promise<string>} Public URL
 */
const uploadToS3 = async (buffer, key, contentType) => {
  const bucket = process.env.AWS_S3_BUCKET;
  await getClient().send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    // Objects are publicly readable via signed URL or bucket policy.
    // If the bucket is private, use presigned URLs instead.
    CacheControl: 'public, max-age=604800, immutable'
  }));

  const region = process.env.AWS_REGION || 'us-east-1';
  const customDomain = process.env.AWS_S3_CUSTOM_DOMAIN;
  if (customDomain) {
    return `https://${customDomain}/${key}`;
  }
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
};

/**
 * Delete an S3 object by its public URL or raw key.
 * Silently no-ops if the URL is not an S3 URL.
 */
const deleteFromS3 = async (urlOrKey) => {
  if (!urlOrKey) return;
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) return;

  let key;
  try {
    const url = new URL(urlOrKey);
    // Strip leading slash from pathname to get the S3 key.
    key = url.pathname.replace(/^\//, '');
  } catch {
    // Not a URL — treat as a raw key.
    key = urlOrKey;
  }

  try {
    await getClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err) {
    logger.warn('S3 delete failed', { key, error: err.message });
  }
};

/**
 * Build an S3 key from the upload subdirectory and filename.
 * e.g. buildKey('collections', 'collection_123.webp') → 'uploads/collections/collection_123.webp'
 */
const buildKey = (subdir, filename) => path.posix.join('uploads', subdir, filename);

module.exports = { isS3Enabled, uploadToS3, deleteFromS3, buildKey };
