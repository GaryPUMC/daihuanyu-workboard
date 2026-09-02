const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotateRight(value, bits) {
  return (value >>> bits) | (value << (32 - bits));
}

function concatBytes(...arrays) {
  const total = arrays.reduce((sum, item) => sum + item.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  arrays.forEach((item) => { result.set(item, offset); offset += item.length; });
  return result;
}

function utf8Encode(text) {
  const encoded = unescape(encodeURIComponent(text));
  const result = new Uint8Array(encoded.length);
  for (let index = 0; index < encoded.length; index += 1) result[index] = encoded.charCodeAt(index);
  return result;
}

function utf8Decode(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return decodeURIComponent(escape(binary));
}

function sha256(message) {
  const length = message.length;
  const bitLength = length * 8;
  const paddedLength = Math.ceil((length + 9) / 64) * 64;
  const data = new Uint8Array(paddedLength);
  data.set(message);
  data[length] = 0x80;
  const view = new DataView(data.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);
  const hash = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const words = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false);
    for (let index = 16; index < 64; index += 1) {
      const a = words[index - 15];
      const b = words[index - 2];
      const s0 = rotateRight(a, 7) ^ rotateRight(a, 18) ^ (a >>> 3);
      const s1 = rotateRight(b, 17) ^ rotateRight(b, 19) ^ (b >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }
    let a = hash[0]; let b = hash[1]; let c = hash[2]; let d = hash[3];
    let e = hash[4]; let f = hash[5]; let g = hash[6]; let h = hash[7];
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + choice + SHA256_K[index] + words[index]) >>> 0;
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0; hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0; hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0; hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0; hash[7] = (hash[7] + h) >>> 0;
  }
  const output = new Uint8Array(32);
  const outputView = new DataView(output.buffer);
  hash.forEach((value, index) => outputView.setUint32(index * 4, value, false));
  return output;
}

function hmacSha256(key, message) {
  let normalizedKey = key.length > 64 ? sha256(key) : key;
  if (normalizedKey.length < 64) normalizedKey = concatBytes(normalizedKey, new Uint8Array(64 - normalizedKey.length));
  const inner = new Uint8Array(64);
  const outer = new Uint8Array(64);
  for (let index = 0; index < 64; index += 1) {
    inner[index] = normalizedKey[index] ^ 0x36;
    outer[index] = normalizedKey[index] ^ 0x5c;
  }
  return sha256(concatBytes(outer, sha256(concatBytes(inner, message))));
}

function pbkdf2(password, salt, iterations, length) {
  const key = utf8Encode(password);
  const output = new Uint8Array(length);
  const blocks = Math.ceil(length / 32);
  for (let block = 1; block <= blocks; block += 1) {
    const counter = new Uint8Array([block >>> 24, block >>> 16, block >>> 8, block]);
    let u = hmacSha256(key, concatBytes(salt, counter));
    const mixed = new Uint8Array(u);
    for (let iteration = 1; iteration < iterations; iteration += 1) {
      u = hmacSha256(key, u);
      for (let index = 0; index < 32; index += 1) mixed[index] ^= u[index];
    }
    output.set(mixed.slice(0, Math.min(32, length - (block - 1) * 32)), (block - 1) * 32);
  }
  return output;
}

function quarterRound(state, a, b, c, d) {
  state[a] = (state[a] + state[b]) >>> 0; state[d] ^= state[a]; state[d] = (state[d] << 16) | (state[d] >>> 16);
  state[c] = (state[c] + state[d]) >>> 0; state[b] ^= state[c]; state[b] = (state[b] << 12) | (state[b] >>> 20);
  state[a] = (state[a] + state[b]) >>> 0; state[d] ^= state[a]; state[d] = (state[d] << 8) | (state[d] >>> 24);
  state[c] = (state[c] + state[d]) >>> 0; state[b] ^= state[c]; state[b] = (state[b] << 7) | (state[b] >>> 25);
}

function readUint32LE(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function chachaBlock(key, counter, nonce) {
  const state = new Uint32Array(16);
  state.set([0x61707865, 0x3320646e, 0x79622d32, 0x6b206574]);
  for (let index = 0; index < 8; index += 1) state[4 + index] = readUint32LE(key, index * 4);
  state[12] = counter;
  state[13] = readUint32LE(nonce, 0); state[14] = readUint32LE(nonce, 4); state[15] = readUint32LE(nonce, 8);
  const working = new Uint32Array(state);
  for (let round = 0; round < 10; round += 1) {
    quarterRound(working, 0, 4, 8, 12); quarterRound(working, 1, 5, 9, 13);
    quarterRound(working, 2, 6, 10, 14); quarterRound(working, 3, 7, 11, 15);
    quarterRound(working, 0, 5, 10, 15); quarterRound(working, 1, 6, 11, 12);
    quarterRound(working, 2, 7, 8, 13); quarterRound(working, 3, 4, 9, 14);
  }
  const output = new Uint8Array(64);
  const view = new DataView(output.buffer);
  for (let index = 0; index < 16; index += 1) view.setUint32(index * 4, (working[index] + state[index]) >>> 0, true);
  return output;
}

function chacha20(key, nonce, input) {
  const output = new Uint8Array(input.length);
  for (let offset = 0, counter = 1; offset < input.length; offset += 64, counter += 1) {
    const block = chachaBlock(key, counter, nonce);
    const size = Math.min(64, input.length - offset);
    for (let index = 0; index < size; index += 1) output[offset + index] = input[offset + index] ^ block[index];
  }
  return output;
}

function randomBytes(length) {
  if (typeof wx === 'undefined' || typeof wx.getRandomValues !== 'function') return Promise.reject(new Error('当前微信版本不支持安全随机数，请升级后重试'));
  return new Promise((resolve, reject) => {
    let settled = false;
    const complete = (result) => {
      if (settled) return;
      settled = true;
      try {
        const buffer = result && result.randomValues ? result.randomValues : result;
        const bytes = new Uint8Array(buffer);
        if (bytes.length !== length) throw new Error('无法生成安全随机数');
        resolve(bytes);
      } catch (error) { reject(error); }
    };
    const fail = () => {
      if (!settled) {
        settled = true;
        reject(new Error('无法生成安全随机数'));
      }
    };
    try {
      const returned = wx.getRandomValues({ length, success: complete, fail });
      if (returned && (returned.randomValues || returned instanceof ArrayBuffer)) complete(returned);
    } catch (error) { fail(); }
  });
}

function bytesToBase64(bytes) {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return wx.arrayBufferToBase64(buffer);
}

function base64ToBytes(text) {
  return new Uint8Array(wx.base64ToArrayBuffer(text));
}

function safeEqual(one, two) {
  if (one.length !== two.length) return false;
  let difference = 0;
  for (let index = 0; index < one.length; index += 1) difference |= one[index] ^ two[index];
  return difference === 0;
}

export async function encryptBackup(workspace, password) {
  if (!password || password.length < 8) throw new Error('备份密码至少需要 8 位');
  const [salt, nonce] = await Promise.all([randomBytes(16), randomBytes(12)]);
  const iterations = 20000;
  const derived = pbkdf2(password, salt, iterations, 64);
  const encryptionKey = derived.slice(0, 32);
  const authenticationKey = derived.slice(32);
  const plaintext = utf8Encode(JSON.stringify(workspace));
  const ciphertext = chacha20(encryptionKey, nonce, plaintext);
  const mac = hmacSha256(authenticationKey, concatBytes(nonce, ciphertext));
  return JSON.stringify({
    format: 'daihuanyu-workboard-encrypted-backup', version: 1,
    createdAt: new Date().toISOString(),
    workspaceSchemaVersion: Number((workspace && workspace.schemaVersion) || 1),
    kdf: { name: 'PBKDF2-HMAC-SHA256', iterations, salt: bytesToBase64(salt) },
    cipher: { name: 'ChaCha20-HMAC-SHA256', nonce: bytesToBase64(nonce) },
    mac: bytesToBase64(mac), data: bytesToBase64(ciphertext),
  });
}

export function decryptBackup(content, password) {
  let envelope;
  try { envelope = JSON.parse(content); } catch (error) { throw new Error('备份文件格式无效'); }
  if (!envelope || envelope.format !== 'daihuanyu-workboard-encrypted-backup' || envelope.version !== 1) throw new Error('不是有效的工作板加密备份');
  const salt = base64ToBytes(envelope.kdf.salt);
  const nonce = base64ToBytes(envelope.cipher.nonce);
  const ciphertext = base64ToBytes(envelope.data);
  const expectedMac = base64ToBytes(envelope.mac);
  const derived = pbkdf2(password, salt, Number(envelope.kdf.iterations), 64);
  const actualMac = hmacSha256(derived.slice(32), concatBytes(nonce, ciphertext));
  if (!safeEqual(actualMac, expectedMac)) throw new Error('密码错误或备份文件已损坏');
  try { return JSON.parse(utf8Decode(chacha20(derived.slice(0, 32), nonce, ciphertext))); }
  catch (error) { throw new Error('备份内容无法解析'); }
}
