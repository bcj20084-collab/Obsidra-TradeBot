import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from "node:crypto";

interface EncryptedValue {
  iv: Buffer;
  tag: Buffer;
  ciphertext: Buffer;
}

export interface ApiCredential {
  source: string;
  apiKey: string;
  apiSecret: string;
}

interface EncryptedCredential {
  source: string;
  apiKey: EncryptedValue;
  apiSecret: EncryptedValue;
}

export class ApiKeyManager {
  private readonly key: Buffer;
  private readonly credentials: EncryptedCredential[];

  constructor(apiKey: string, apiSecret: string, masterSecret: string, fallbackCredentials: ApiCredential[] = []) {
    this.key = pbkdf2Sync(masterSecret, "obsidra-api-key-v2", 100_000, 32, "sha256");
    const credentials = [
      { source: "primary", apiKey, apiSecret },
      ...fallbackCredentials,
    ].filter((credential) => credential.apiKey.trim() && credential.apiSecret.trim());
    this.credentials = credentials.map((credential) => ({
      source: credential.source,
      apiKey: this.encrypt(credential.apiKey.trim()),
      apiSecret: this.encrypt(credential.apiSecret.trim()),
    }));
  }

  withCredentials<T>(operation: (apiKey: string, apiSecret: string) => T): T {
    const credential = this.credentials[0];
    if (!credential) throw new Error("Bybit API credentials are not configured");
    return operation(this.decrypt(credential.apiKey), this.decrypt(credential.apiSecret));
  }

  credentialCount(): number {
    return this.credentials.length;
  }

  withCredentialAt<T>(index: number, operation: (credential: ApiCredential) => T): T {
    const credential = this.credentials[index];
    if (!credential) throw new Error(`Bybit API credential ${index} is not configured`);
    return operation({
      source: credential.source,
      apiKey: this.decrypt(credential.apiKey),
      apiSecret: this.decrypt(credential.apiSecret),
    });
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
