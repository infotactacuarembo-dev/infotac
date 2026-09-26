/* Módulo aislado para revisión: no conectado a botones ni publicado. */
(function (global) {
  'use strict';

  const FORMAT = 'infotac-backup-encrypted';
  const VERSION = 1;
  const ITERATIONS = 600000;
  const MAX_FILE_BYTES = 25 * 1024 * 1024;
  const MAX_DATA_BYTES = 15 * 1024 * 1024;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', { fatal: true });

  function requireCrypto() {
    if (!global.isSecureContext || !global.crypto || !global.crypto.subtle) {
      throw new Error('El cifrado requiere HTTPS y Web Crypto.');
    }
  }

  function encodeBase64(bytes) {
    let binary = '';
    for (let index = 0; index < bytes.length; index += 8192) {
      binary += String.fromCharCode.apply(null, bytes.subarray(index, index + 8192));
    }
    return btoa(binary);
  }

  function decodeBase64(value, expectedLength) {
    if (typeof value !== 'string' || value.length > Math.ceil(MAX_FILE_BYTES / 3) * 4 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
      throw new Error('Formato de respaldo inválido.');
    }
    let binary;
    try { binary = atob(value); } catch (_) { throw new Error('Formato de respaldo inválido.'); }
    if (expectedLength !== undefined && binary.length !== expectedLength) {
      throw new Error('Formato de respaldo inválido.');
    }
    const bytes = Uint8Array.from(binary, function (character) { return character.charCodeAt(0); });
    if (encodeBase64(bytes) !== value) throw new Error('Formato de respaldo inválido.');
    return bytes;
  }

  function checkPassword(password) {
    if (typeof password !== 'string') throw new Error('Contraseña de respaldo inválida.');
    const bytes = encoder.encode(password);
    if (bytes.length < 16 || bytes.length > 1024) {
      throw new Error('La contraseña debe tener entre 16 y 1024 bytes.');
    }
    return bytes;
  }

  async function deriveKey(password, salt) {
    const source = await global.crypto.subtle.importKey('raw', checkPassword(password), 'PBKDF2', false, ['deriveKey']);
    return global.crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, hash: 'SHA-256', iterations: ITERATIONS },
      source,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  function associatedData(salt, iv) {
    return encoder.encode(JSON.stringify([FORMAT, VERSION, ITERATIONS, salt, iv]));
  }

  async function encrypt(data, password) {
    requireCrypto();
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Datos de respaldo inválidos.');
    }
    const clear = encoder.encode(JSON.stringify(data));
    if (clear.length > MAX_DATA_BYTES) throw new Error('Datos de respaldo demasiado grandes.');
    const salt = global.crypto.getRandomValues(new Uint8Array(16));
    const iv = global.crypto.getRandomValues(new Uint8Array(12));
    const salt64 = encodeBase64(salt);
    const iv64 = encodeBase64(iv);
    const key = await deriveKey(password, salt);
    const sealed = new Uint8Array(await global.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv, additionalData: associatedData(salt64, iv64), tagLength: 128 },
      key,
      clear
    ));
    const file = JSON.stringify({
      format: FORMAT,
      version: VERSION,
      kdf: 'PBKDF2-HMAC-SHA-256',
      iterations: ITERATIONS,
      cipher: 'AES-256-GCM',
      salt: salt64,
      iv: iv64,
      ciphertext: encodeBase64(sealed)
    });
    if (encoder.encode(file).length > MAX_FILE_BYTES) throw new Error('Archivo demasiado grande.');
    return file;
  }

  async function decrypt(file, password) {
    requireCrypto();
    if (typeof file !== 'string' || encoder.encode(file).length > MAX_FILE_BYTES) {
      throw new Error('Archivo demasiado grande o inválido.');
    }
    let envelope;
    try { envelope = JSON.parse(file); } catch (_) { throw new Error('Formato de respaldo inválido.'); }
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) ||
        Object.keys(envelope).sort().join(',') !== 'cipher,ciphertext,format,iterations,iv,kdf,salt,version' ||
        envelope.format !== FORMAT || envelope.version !== VERSION ||
        envelope.kdf !== 'PBKDF2-HMAC-SHA-256' || envelope.iterations !== ITERATIONS ||
        envelope.cipher !== 'AES-256-GCM') {
      throw new Error('Formato o versión de respaldo incompatible.');
    }
    const salt = decodeBase64(envelope.salt, 16);
    const iv = decodeBase64(envelope.iv, 12);
    const ciphertext = decodeBase64(envelope.ciphertext);
    if (ciphertext.length < 16 || ciphertext.length > MAX_DATA_BYTES + 16) {
      throw new Error('Formato de respaldo inválido.');
    }
    const key = await deriveKey(password, salt);
    let clear;
    try {
      clear = await global.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv, additionalData: associatedData(envelope.salt, envelope.iv), tagLength: 128 },
        key,
        ciphertext
      );
    } catch (_) {
      throw new Error('Contraseña incorrecta o respaldo alterado.');
    }
    let data;
    try { data = JSON.parse(decoder.decode(clear)); } catch (_) {
      throw new Error('Contenido descifrado inválido.');
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Contenido descifrado inválido.');
    }
    return data;
  }

  global.InfotacBackupCrypto = Object.freeze({ encrypt: encrypt, decrypt: decrypt });
})(window);
