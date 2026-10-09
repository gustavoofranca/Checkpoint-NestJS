import { argon2Sync, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PasswordHasher } from './password-hasher';

const PHC = /^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/;

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();

  it('produces an Argon2id PHC string with the OWASP minimum parameters', async () => {
    expect(await hasher.hash('correct horse battery staple')).toMatch(PHC);
  });

  it('verifies the right password and rejects a wrong one', async () => {
    const encoded = await hasher.hash('correct horse battery staple');

    expect(await hasher.verify('correct horse battery staple', encoded)).toBe(true);
    expect(await hasher.verify('correct horse battery stapl', encoded)).toBe(false);
  });

  it('salts every hash', async () => {
    const first = await hasher.hash('same password twice');
    const second = await hasher.hash('same password twice');

    expect(first).not.toBe(second);
  });

  it('verifies a hash made with other parameters, using the ones stored in it', async () => {
    const salt = randomBytes(16);
    const tag = argon2Sync('argon2id', {
      message: 'older parameters',
      nonce: salt,
      memory: 12_288,
      passes: 3,
      parallelism: 1,
      tagLength: 32,
    });
    const base64 = (buffer: Buffer) => buffer.toString('base64').replace(/=+$/, '');
    const encoded = `$argon2id$v=19$m=12288,t=3,p=1$${base64(salt)}$${base64(tag)}`;

    expect(await hasher.verify('older parameters', encoded)).toBe(true);
  });

  it('throws on a stored value that is not an Argon2id hash', async () => {
    await expect(hasher.verify('anything', '$2b$10$bcryptLooksLikeThis')).rejects.toThrow(
      'not an Argon2id PHC string',
    );
  });
});

// Node added Argon2 in v24.7.0. This pins the native primitive to the specification.
describe('node:crypto argon2id', () => {
  it('matches the RFC 9106 section 5.3 test vector', () => {
    const tag = argon2Sync('argon2id', {
      message: Buffer.alloc(32, 0x01),
      nonce: Buffer.alloc(16, 0x02),
      secret: Buffer.alloc(8, 0x03),
      associatedData: Buffer.alloc(12, 0x04),
      memory: 32,
      passes: 3,
      parallelism: 4,
      tagLength: 32,
    });

    expect(tag.toString('hex')).toBe(
      '0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659',
    );
  });
});
