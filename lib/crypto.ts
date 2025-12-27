// Web Crypto based encryption (works on Node & Edge runtimes)

function getKeyBytes(): Uint8Array {
  const raw = process.env.ENCRYPTION_KEY || ''
  if (!raw) throw new Error('Missing ENCRYPTION_KEY')
  const enc = new TextEncoder().encode(raw)
  if (enc.length === 32) return enc
  if (enc.length > 32) return enc.slice(0, 32)
  const out = new Uint8Array(32)
  out.set(enc)
  return out
}

async function getAesKey(): Promise<CryptoKey> {
  const keyBytes = getKeyBytes()
  // Ensure we pass a clean ArrayBuffer view (no SharedArrayBuffer)
  const ab = keyBytes.buffer.slice(
    keyBytes.byteOffset,
    keyBytes.byteOffset + keyBytes.byteLength
  ) as ArrayBuffer
  return await crypto.subtle.importKey(
    'raw',
    ab,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

function toBase64(u8: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64')
  // browser
  let str = ''
  u8.forEach((b) => (str += String.fromCharCode(b)))
  return btoa(str)
}

function fromBase64(s: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(s, 'base64'))
  // browser
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export async function encrypt(plain: string): Promise<string> {
  const key = await getAesKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = new TextEncoder().encode(plain)
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data))
  // Store as [iv | ciphertext+tag]
  const packed = new Uint8Array(iv.length + ct.length)
  packed.set(iv, 0)
  packed.set(ct, iv.length)
  return toBase64(packed)
}

export async function decrypt(input: string): Promise<string> {
  const key = await getAesKey()
  // Try current format: [iv | ciphertext+tag]
  try {
    const packed = fromBase64(input)
    if (packed.length >= 12 + 16) {
      const iv = packed.slice(0, 12)
      const ctPlusTag = packed.slice(12)
      const out = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ctPlusTag)
      return new TextDecoder().decode(out)
    }
  } catch {
    // fallthrough to legacy attempts
  }
  // Legacy Node format: [iv | tag | ciphertext] -> need to combine (ciphertext + tag)
  try {
    const legacy = fromBase64(input)
    if (legacy.length >= 12 + 16) {
      const iv = legacy.slice(0, 12)
      const tag = legacy.slice(12, 28)
      const data = legacy.slice(28)
      const combined = new Uint8Array(data.length + tag.length)
      combined.set(data, 0)
      combined.set(tag, data.length)
      const out = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, combined)
      return new TextDecoder().decode(out)
    }
  } catch {
    // ignore
  }
  // Plain base64 fallback (very legacy)
  try {
    if (typeof Buffer !== 'undefined') return Buffer.from(input, 'base64').toString('utf8')
    const bin = atob(input)
    return decodeURIComponent(escape(bin))
  } catch {
    return input
  }
}
