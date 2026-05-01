import nacl from 'tweetnacl';

const encodeUTF8 = (str) => new TextEncoder().encode(str);
const decodeUTF8 = (buf) => new TextDecoder().decode(buf);

const encodeBase64 = (bytes) => btoa(String.fromCharCode(...bytes));
const decodeBase64 = (b64) => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const STORAGE_KEY = 'numisroma:encryptedPrivateKey';
const SESSION_KEY = 'numisroma:privateKey'; // sessionStorage — cleared on tab/browser close
const PBKDF2_ITERATIONS = 200_000;
const PBKDF2_HASH = 'SHA-256';

// Store the raw private key bytes in sessionStorage for same-session reloads.
export function cachePrivateKeyInSession(privateKeyBytes) {
  try {
    sessionStorage.setItem(SESSION_KEY, encodeBase64(privateKeyBytes));
  } catch {}
}

// Retrieve the private key bytes from sessionStorage (returns null if not found).
export function loadPrivateKeyFromSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return decodeBase64(raw);
  } catch {
    return null;
  }
}

export function clearSessionPrivateKey() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
}

// ── Key derivation ────────────────────────────────────────────────────────────

async function deriveKey(password, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encodeUTF8(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: PBKDF2_HASH },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ── Keypair management ────────────────────────────────────────────────────────

// Generate a new X25519 keypair and lock the private key with the user's password.
// Returns { publicKey: base64, encryptedPrivateKey: <stored string> }.
export async function generateAndLockKeypair(password) {
  const keypair = nacl.box.keyPair();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await deriveKey(password, salt);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    keypair.secretKey
  );

  const stored = JSON.stringify({
    salt: encodeBase64(salt),
    iv:   encodeBase64(iv),
    ct:   encodeBase64(new Uint8Array(encrypted))
  });

  localStorage.setItem(STORAGE_KEY, stored);
  return {
    publicKey:           encodeBase64(keypair.publicKey),
    publicKeyBytes:      keypair.publicKey,
    privateKeyBytes:     keypair.secretKey,
  };
}

// Unlock the private key from localStorage using the user's password.
// Returns { publicKeyBytes, privateKeyBytes } or null if not found / wrong password.
export async function unlockKeypair(password) {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const { salt, iv, ct } = JSON.parse(raw);
    const key = await deriveKey(password, decodeBase64(salt));
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: decodeBase64(iv) },
      key,
      decodeBase64(ct)
    );
    const privateKeyBytes = new Uint8Array(decrypted);
    const publicKeyBytes  = nacl.box.keyPair.fromSecretKey(privateKeyBytes).publicKey;
    return { privateKeyBytes, publicKeyBytes };
  } catch {
    return null;
  }
}

// Re-encrypt the stored private key under a new password (called on password change).
export async function relockKeypair(oldPassword, newPassword) {
  const keys = await unlockKeypair(oldPassword);
  if (!keys) throw new Error('Could not unlock keypair with old password');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await deriveKey(newPassword, salt);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    keys.privateKeyBytes
  );
  const stored = JSON.stringify({
    salt: encodeBase64(salt),
    iv:   encodeBase64(iv),
    ct:   encodeBase64(new Uint8Array(encrypted))
  });
  localStorage.setItem(STORAGE_KEY, stored);
}

export function clearStoredKeypair() {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasStoredKeypair() {
  return !!localStorage.getItem(STORAGE_KEY);
}

// Restore a keypair from a server-provided encrypted blob string (JSON).
// Returns { privateKeyBytes, publicKeyBytes } or null if decryption fails.
export async function restoreKeypairFromBlob(blobJson, password) {
  try {
    const { salt, iv, ct } = JSON.parse(blobJson);
    const key = await deriveKey(password, decodeBase64(salt));
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: decodeBase64(iv) },
      key,
      decodeBase64(ct)
    );
    const privateKeyBytes = new Uint8Array(decrypted);
    const publicKeyBytes = nacl.box.keyPair.fromSecretKey(privateKeyBytes).publicKey;
    return { privateKeyBytes, publicKeyBytes };
  } catch {
    return null;
  }
}

// Write an encrypted blob string directly to localStorage (used when restoring from server).
export function saveKeypairBlob(blobJson) {
  try { localStorage.setItem(STORAGE_KEY, blobJson); } catch {}
}

// ── Encrypt / Decrypt ─────────────────────────────────────────────────────────

// Encrypt a plaintext string for a recipient.
// Returns { ciphertext: base64, nonce: base64 }.
export function encryptMessage(plaintext, recipientPublicKeyB64, senderPrivateKeyBytes) {
  const nonce         = nacl.randomBytes(nacl.box.nonceLength);
  const recipientKey  = decodeBase64(recipientPublicKeyB64);
  const messageBytes  = encodeUTF8(plaintext);
  const encrypted     = nacl.box(messageBytes, nonce, recipientKey, senderPrivateKeyBytes);
  return {
    ciphertext: encodeBase64(encrypted),
    nonce:      encodeBase64(nonce),
  };
}

// Decrypt a ciphertext received from a sender.
// Returns plaintext string, or null if decryption fails.
export function decryptMessage(ciphertextB64, nonceB64, senderPublicKeyB64, recipientPrivateKeyBytes) {
  try {
    const ciphertext = decodeBase64(ciphertextB64);
    const nonce      = decodeBase64(nonceB64);
    const senderKey  = decodeBase64(senderPublicKeyB64);
    const decrypted  = nacl.box.open(ciphertext, nonce, senderKey, recipientPrivateKeyBytes);
    if (!decrypted) return null;
    return decodeUTF8(decrypted);
  } catch {
    return null;
  }
}

export { encodeBase64 };
