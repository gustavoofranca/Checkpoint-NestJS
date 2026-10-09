import { type Argon2Parameters, argon2, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';

// OWASP Password Storage Cheat Sheet (checked 2026-10-09): Argon2id, m=19 MiB, t=2, p=1.
const MEMORY_KIB = 19_456;
const PASSES = 2;
const PARALLELISM = 1;
const SALT_BYTES = 16;
const TAG_BYTES = 32;
const ARGON2_VERSION = 19;

// PHC string format, as written by the reference implementation and most libraries:
// $argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>, base64 without padding.
const PHC_PATTERN =
  /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

interface StoredHash {
  memory: number;
  passes: number;
  parallelism: number;
  salt: Buffer;
  tag: Buffer;
}

function derive(
  password: string,
  stored: Omit<StoredHash, 'tag'>,
  tagLength: number,
): Promise<Buffer> {
  const parameters: Argon2Parameters = {
    message: password,
    nonce: stored.salt,
    memory: stored.memory,
    passes: stored.passes,
    parallelism: stored.parallelism,
    tagLength,
  };
  return new Promise<Buffer>((resolve, reject) => {
    argon2('argon2id', parameters, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}

function encodeBase64(buffer: Buffer): string {
  return buffer.toString('base64').replace(/=+$/, '');
}

function parse(encoded: string): StoredHash {
  const [, memory, passes, parallelism, salt, tag] = PHC_PATTERN.exec(encoded) ?? [];
  if (
    memory === undefined ||
    passes === undefined ||
    parallelism === undefined ||
    salt === undefined ||
    tag === undefined
  ) {
    throw new Error('Stored password hash is not an Argon2id PHC string');
  }
  return {
    memory: Number(memory),
    passes: Number(passes),
    parallelism: Number(parallelism),
    salt: Buffer.from(salt, 'base64'),
    tag: Buffer.from(tag, 'base64'),
  };
}

@Injectable()
export class PasswordHasher {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const tag = await derive(
      password,
      { memory: MEMORY_KIB, passes: PASSES, parallelism: PARALLELISM, salt },
      TAG_BYTES,
    );
    return `$argon2id$v=${String(ARGON2_VERSION)}$m=${String(MEMORY_KIB)},t=${String(PASSES)},p=${String(PARALLELISM)}$${encodeBase64(salt)}$${encodeBase64(tag)}`;
  }

  // Verifies with the parameters stored in the hash, so hashes made before a parameter change
  // still verify. A malformed hash is a broken state, not a wrong password, so it throws.
  async verify(password: string, encoded: string): Promise<boolean> {
    const stored = parse(encoded);
    const candidate = await derive(password, stored, stored.tag.length);
    return timingSafeEqual(candidate, stored.tag);
  }
}
