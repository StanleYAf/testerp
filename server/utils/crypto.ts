import bcrypt from "bcryptjs";
import crypto from "crypto";

export class CryptoUtils {
  static async hashPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return bcrypt.hash(password, saltRounds);
  }

  static async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  static generateApiKey(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  static generateSecureToken(): string {
    return crypto.randomBytes(64).toString("hex");
  }

  static generateUUID(): string {
    return crypto.randomUUID();
  }

  static hashWebhookPayload(payload: string, secret: string): string {
    return crypto.createHmac("sha256", secret).update(payload).digest("hex");
  }

  static verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    const expectedSignature = this.hashWebhookPayload(payload, secret);
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  }

  static encryptData(data: string, key: string): { encrypted: string; iv: string } {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher("aes-256-cbc", key);
    let encrypted = cipher.update(data, "utf8", "hex");
    encrypted += cipher.final("hex");
    return { encrypted, iv: iv.toString("hex") };
  }

  static decryptData(encryptedData: string, key: string, iv: string): string {
    const decipher = crypto.createDecipher("aes-256-cbc", key);
    let decrypted = decipher.update(encryptedData, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }
}
