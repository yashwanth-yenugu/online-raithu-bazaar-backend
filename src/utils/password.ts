// Using WebCrypto for password hashing (PBKDF2)
const SALT_LENGTH = 16;
const ITERATIONS = 100000;
const HASH_LENGTH = 32;
const ALGORITHM = 'PBKDF2';

async function getPasswordKey(password: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: ALGORITHM },
    false,
    ['deriveBits']
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const key = await getPasswordKey(password);
  const hash = await crypto.subtle.deriveBits(
    {
      name: ALGORITHM,
      salt: salt.buffer,
      iterations: ITERATIONS,
      hash: 'SHA-256'
    },
    key,
    HASH_LENGTH * 8
  );

  // Combine salt and hash
  const hashArray = new Uint8Array(hash);
  const combinedArray = new Uint8Array(salt.length + hashArray.length);
  combinedArray.set(salt);
  combinedArray.set(hashArray, salt.length);

  return btoa(String.fromCharCode(...combinedArray));
}

export async function comparePassword(password: string, storedHash: string): Promise<boolean> {
  try {
    const combined = Uint8Array.from(atob(storedHash), c => c.charCodeAt(0));
    const salt = combined.slice(0, SALT_LENGTH);
    const hash = combined.slice(SALT_LENGTH);

    const key = await getPasswordKey(password);
    const newHash = await crypto.subtle.deriveBits(
      {
        name: ALGORITHM,
        salt: salt.buffer,
        iterations: ITERATIONS,
        hash: 'SHA-256'
      },
      key,
      HASH_LENGTH * 8
    );

    const newHashArray = new Uint8Array(newHash);
    if (hash.length !== newHashArray.length) return false;

    return hash.every((value, index) => value === newHashArray[index]);
  } catch {
    return false;
  }
}
