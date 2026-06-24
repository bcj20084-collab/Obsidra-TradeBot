import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from "node:crypto";

interface EncryptedValue {
  iv: Buffer;
  tag: Buffer;
  ciphertext: Buffer;
}

export class ApiKeyManager {
  private readonly key: Buffer;
  private readonly apiKey: EncryptedValue;
  private readonly apiSecret: EncryptedValue;

  constructor(apiKey: string, apiSecret: string, masterSecret: string) {
    this.key = pbkdf2Sync(masterSecret, "obsidra-api-key-v2", 100_000, 32, "sha256");
    this.apiKey = this.encrypt(apiKey);
    this.apiSecret = this.encrypt(apiSecret);
  }

  withCredentials<T>(operation: (apiKey: string, apiSecret: string) => T): T {
    return operation(this.decrypt(this.apiKey), this.decrypt(this.apiSecret));
  }

  private encrypt(value: string): EncryptedValue {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return { iv, tag: cipher.getAuthTag(), ciphertext };
  }

  private decrypt(value: EncryptedValue): string {
    const decipher = createDecipheriv("aes-256-gcm", this.key, value.iv);
    decipher.setAuthTag(value.tag);
    return Buffer.concat([decipher.update(value.ciphertext), decipher.final()]).toString("utf8");
  }
}
