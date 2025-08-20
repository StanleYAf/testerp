import axios from "axios";
import { logger } from "../utils/logger";
import QRCode from "qrcode";

export interface EfiPaymentData {
  amount: number;
  description: string;
  externalId: string;
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
  };
}

export interface EfiPaymentResponse {
  paymentId: string;
  qrCode: string;
  qrCodeImage?: string;
  expiresAt: Date;
  amount: number;
  status: string;
}

export interface EfiWebhookData {
  eventType: string;
  paymentId: string;
  status: string;
  amount: number;
  paidAt?: string;
  cancellationReason?: string;
}

export class EfiService {
  private clientId: string;
  private clientSecret: string;
  private pixKey: string;
  private webhookSecret: string;
  private baseUrl: string;
  private accessToken?: string;
  private tokenExpiresAt?: Date;

  constructor() {
    this.clientId = process.env.EFI_CLIENT_ID || "";
    this.clientSecret = process.env.EFI_CLIENT_SECRET || "";
    this.pixKey = process.env.EFI_PIX_KEY || "";
    this.webhookSecret = process.env.EFI_WEBHOOK_SECRET || "";
    this.baseUrl = process.env.EFI_BASE_URL || "https://api-pix.gerencianet.com.br";

    if (!this.clientId || !this.clientSecret) {
      logger.warn("EfiBank credentials not configured, using mock mode");
    }
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiresAt && this.tokenExpiresAt > new Date()) {
      return this.accessToken;
    }

    if (!this.clientId || !this.clientSecret) {
      // Mock mode for development
      this.accessToken = "mock_token";
      this.tokenExpiresAt = new Date(Date.now() + 3600000); // 1 hour from now
      return this.accessToken;
    }

    try {
      const response = await axios.post(`${this.baseUrl}/oauth/token`, {
        grant_type: "client_credentials"
      }, {
        auth: {
          username: this.clientId,
          password: this.clientSecret
        },
        headers: {
          "Content-Type": "application/json"
        }
      });

      this.accessToken = response.data.access_token;
      this.tokenExpiresAt = new Date(Date.now() + (response.data.expires_in * 1000));

      return this.accessToken;
    } catch (error) {
      logger.error("Failed to get EfiBank access token", { error });
      throw new Error("Failed to authenticate with EfiBank");
    }
  }

  async createPixPayment(paymentData: EfiPaymentData): Promise<EfiPaymentResponse> {
    try {
      if (!this.clientId || !this.clientSecret) {
        // Mock response for development
        logger.info("Creating mock PIX payment", { paymentData });
        
        const mockQrCode = `00020126580014BR.GOV.BCB.PIX0136${this.pixKey || "mock-pix-key"}5204000053039865802BR5925FiveM Store6014SAO PAULO610908765-4326304`;
        const qrCodeImage = await QRCode.toDataURL(mockQrCode);
        
        return {
          paymentId: `mock_${Date.now()}`,
          qrCode: mockQrCode,
          qrCodeImage,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
          amount: paymentData.amount,
          status: "pending"
        };
      }

      const token = await this.getAccessToken();

      const pixPayload = {
        calendario: {
          expiracao: 900 // 15 minutes in seconds
        },
        devedor: paymentData.customer ? {
          nome: paymentData.customer.name,
          cpf: "00000000000" // You might want to collect CPF from customers
        } : undefined,
        valor: {
          original: paymentData.amount.toFixed(2)
        },
        chave: this.pixKey,
        solicitacaoPagador: paymentData.description,
        infoAdicionais: [
          {
            nome: "External ID",
            valor: paymentData.externalId
          }
        ]
      };

      const response = await axios.post(`${this.baseUrl}/v2/cob`, pixPayload, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      const qrCodeResponse = await axios.get(`${this.baseUrl}/v2/loc/${response.data.loc.id}/qrcode`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const qrCodeImage = await QRCode.toDataURL(qrCodeResponse.data.qrcode);

      return {
        paymentId: response.data.txid,
        qrCode: qrCodeResponse.data.qrcode,
        qrCodeImage,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        amount: paymentData.amount,
        status: "pending"
      };
    } catch (error) {
      logger.error("Failed to create PIX payment", { error, paymentData });
      throw new Error("Failed to create PIX payment");
    }
  }

  async getPaymentStatus(paymentId: string): Promise<{ status: string; paidAt?: Date; amount?: number }> {
    try {
      if (!this.clientId || !this.clientSecret || paymentId.startsWith("mock_")) {
        // Mock response for development
        logger.info("Getting mock payment status", { paymentId });
        
        // Simulate random status for testing
        const statuses = ["pending", "approved", "cancelled"];
        const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
        
        return {
          status: randomStatus,
          paidAt: randomStatus === "approved" ? new Date() : undefined,
          amount: 25.00
        };
      }

      const token = await this.getAccessToken();

      const response = await axios.get(`${this.baseUrl}/v2/cob/${paymentId}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      return {
        status: response.data.status === "CONCLUIDA" ? "approved" : "pending",
        paidAt: response.data.pix?.[0]?.horario ? new Date(response.data.pix[0].horario) : undefined,
        amount: parseFloat(response.data.valor?.original || "0")
      };
    } catch (error) {
      logger.error("Failed to get payment status", { error, paymentId });
      throw new Error("Failed to get payment status");
    }
  }

  validateWebhookSignature(payload: string, signature: string): boolean {
    if (!this.webhookSecret) {
      logger.warn("Webhook secret not configured, skipping signature validation");
      return true; // Allow in development mode
    }

    const crypto = require("crypto");
    const expectedSignature = crypto.createHmac("sha256", this.webhookSecret)
      .update(payload)
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expectedSignature, "hex")
    );
  }

  parseWebhookData(payload: any): EfiWebhookData {
    // Parse EfiBank webhook payload format
    return {
      eventType: payload.evento || "payment.update",
      paymentId: payload.pix?.[0]?.txid || payload.txid,
      status: payload.pix?.[0]?.status === "CONCLUIDA" ? "approved" : 
              payload.pix?.[0]?.status === "REMOVIDA_PELO_USUARIO_RECEBEDOR" ? "cancelled" : "pending",
      amount: parseFloat(payload.pix?.[0]?.valor || "0"),
      paidAt: payload.pix?.[0]?.horario,
      cancellationReason: payload.pix?.[0]?.devolucoes?.[0]?.motivo
    };
  }

  async cancelPayment(paymentId: string): Promise<boolean> {
    try {
      if (!this.clientId || !this.clientSecret || paymentId.startsWith("mock_")) {
        logger.info("Cancelling mock payment", { paymentId });
        return true;
      }

      const token = await this.getAccessToken();

      await axios.patch(`${this.baseUrl}/v2/cob/${paymentId}`, {
        status: "REMOVIDA_PELO_USUARIO_RECEBEDOR"
      }, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      return true;
    } catch (error) {
      logger.error("Failed to cancel payment", { error, paymentId });
      return false;
    }
  }

  formatCurrency(amount: number, currency: string = "BRL"): string {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency
    }).format(amount);
  }

  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret && this.pixKey);
  }
}

export const efiService = new EfiService();
