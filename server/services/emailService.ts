import nodemailer from "nodemailer";
import { logger } from "../utils/logger";

export interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  template?: string;
  data?: Record<string, any>;
}

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export class EmailService {
  private transporter: nodemailer.Transporter;
  private isConfigured: boolean = false;

  constructor() {
    this.setupTransporter();
  }

  private setupTransporter() {
    const smtpConfig = {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_PORT === "465", // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    };

    if (smtpConfig.host && smtpConfig.auth.user && smtpConfig.auth.pass) {
      this.transporter = nodemailer.createTransport(smtpConfig);
      this.isConfigured = true;
      logger.info("Email service configured successfully");
    } else {
      logger.warn("Email service not configured - SMTP credentials missing");
      // Create a test transporter for development
      this.transporter = nodemailer.createTransport({
        streamTransport: true,
        newline: "unix",
        buffer: true
      });
    }
  }

  private getTemplate(templateName: string, data: Record<string, any> = {}): EmailTemplate {
    const templates: Record<string, EmailTemplate> = {
      welcome: {
        subject: "Welcome to FiveM Store!",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #00d4ff;">Welcome to FiveM Store!</h1>
            <p>Hello ${data.username || "Player"},</p>
            <p>Your account has been successfully created. You can now browse our store and make purchases.</p>
            <p>Your account details:</p>
            <ul>
              <li>Username: ${data.username}</li>
              <li>Email: ${data.email}</li>
              <li>FiveM ID: ${data.fivemIdentifier || "Not set"}</li>
            </ul>
            <p>Happy gaming!</p>
            <p>- FiveM Store Team</p>
          </div>
        `,
        text: `Welcome to FiveM Store!\n\nHello ${data.username || "Player"},\n\nYour account has been successfully created. You can now browse our store and make purchases.\n\nYour account details:\n- Username: ${data.username}\n- Email: ${data.email}\n- FiveM ID: ${data.fivemIdentifier || "Not set"}\n\nHappy gaming!\n\n- FiveM Store Team`
      },

      purchase_confirmation: {
        subject: "Purchase Confirmation - FiveM Store",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #00ff88;">Purchase Confirmed!</h1>
            <p>Hello ${data.username || "Player"},</p>
            <p>Your purchase has been confirmed and items are being delivered to your FiveM character.</p>
            <div style="background: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 5px;">
              <h3>Order Details:</h3>
              <p><strong>Transaction ID:</strong> ${data.transactionId}</p>
              <p><strong>Amount:</strong> ${data.amount}</p>
              <p><strong>Payment Method:</strong> ${data.paymentMethod}</p>
              <p><strong>Items:</strong></p>
              <ul>
                ${data.items?.map((item: any) => `<li>${item.name} x${item.quantity}</li>`).join("") || "<li>No items listed</li>"}
              </ul>
            </div>
            <p>Items will be delivered to your character the next time you join the server.</p>
            <p>Thank you for your purchase!</p>
            <p>- FiveM Store Team</p>
          </div>
        `,
        text: `Purchase Confirmed!\n\nHello ${data.username || "Player"},\n\nYour purchase has been confirmed and items are being delivered to your FiveM character.\n\nOrder Details:\n- Transaction ID: ${data.transactionId}\n- Amount: ${data.amount}\n- Payment Method: ${data.paymentMethod}\n\nItems will be delivered to your character the next time you join the server.\n\nThank you for your purchase!\n\n- FiveM Store Team`
      },

      password_reset: {
        subject: "Password Reset - FiveM Store",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #ffa500;">Password Reset Request</h1>
            <p>Hello ${data.username || "Player"},</p>
            <p>We received a request to reset your password. If you didn't make this request, please ignore this email.</p>
            <p>To reset your password, click the link below:</p>
            <a href="${data.resetLink}" style="display: inline-block; background: #00d4ff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a>
            <p>This link will expire in 24 hours.</p>
            <p>- FiveM Store Team</p>
          </div>
        `,
        text: `Password Reset Request\n\nHello ${data.username || "Player"},\n\nWe received a request to reset your password. If you didn't make this request, please ignore this email.\n\nTo reset your password, visit: ${data.resetLink}\n\nThis link will expire in 24 hours.\n\n- FiveM Store Team`
      },

      delivery_notification: {
        subject: "Items Delivered - FiveM Store",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #00ff88;">Items Delivered!</h1>
            <p>Hello ${data.username || "Player"},</p>
            <p>Your purchased items have been successfully delivered to your FiveM character.</p>
            <div style="background: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 5px;">
              <h3>Delivered Items:</h3>
              <ul>
                ${data.items?.map((item: any) => `<li>${item.name} x${item.quantity}</li>`).join("") || "<li>No items listed</li>"}
              </ul>
            </div>
            <p>Enjoy your new items!</p>
            <p>- FiveM Store Team</p>
          </div>
        `,
        text: `Items Delivered!\n\nHello ${data.username || "Player"},\n\nYour purchased items have been successfully delivered to your FiveM character.\n\nEnjoy your new items!\n\n- FiveM Store Team`
      },

      vip_activation: {
        subject: "VIP Activated - FiveM Store",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #ffd700;">VIP Status Activated!</h1>
            <p>Hello ${data.username || "Player"},</p>
            <p>Congratulations! Your VIP status has been activated.</p>
            <div style="background: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 5px;">
              <h3>VIP Details:</h3>
              <p><strong>Level:</strong> ${data.vipLevel}</p>
              <p><strong>Expires:</strong> ${data.vipExpires}</p>
            </div>
            <p>Enjoy your VIP benefits on the server!</p>
            <p>- FiveM Store Team</p>
          </div>
        `,
        text: `VIP Status Activated!\n\nHello ${data.username || "Player"},\n\nCongratulations! Your VIP status has been activated.\n\nVIP Level: ${data.vipLevel}\nExpires: ${data.vipExpires}\n\nEnjoy your VIP benefits on the server!\n\n- FiveM Store Team`
      }
    };

    return templates[templateName] || {
      subject: "FiveM Store Notification",
      html: `<p>${data.message || "You have a new notification from FiveM Store."}</p>`,
      text: data.message || "You have a new notification from FiveM Store."
    };
  }

  async sendEmail(options: EmailOptions): Promise<boolean> {
    try {
      let emailContent: EmailTemplate;

      if (options.template) {
        emailContent = this.getTemplate(options.template, options.data);
      } else {
        emailContent = {
          subject: options.subject,
          html: options.html || options.text || "",
          text: options.text || options.html || ""
        };
      }

      const mailOptions = {
        from: `"FiveM Store" <${process.env.SMTP_USER || "noreply@fivemstore.com"}>`,
        to: options.to,
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html
      };

      if (!this.isConfigured) {
        logger.info("Email would be sent (SMTP not configured)", { mailOptions });
        return true; // Return success in development mode
      }

      const result = await this.transporter.sendMail(mailOptions);
      logger.info("Email sent successfully", { 
        to: options.to, 
        subject: emailContent.subject,
        messageId: result.messageId 
      });

      return true;
    } catch (error) {
      logger.error("Failed to send email", { 
        error: error.message,
        to: options.to,
        subject: options.subject
      });
      return false;
    }
  }

  async sendWelcomeEmail(user: { username: string; email: string; fivemIdentifier?: string }): Promise<boolean> {
    return this.sendEmail({
      to: user.email,
      template: "welcome",
      data: user
    });
  }

  async sendPurchaseConfirmation(
    user: { username: string; email: string },
    transaction: { id: string; amount: number; paymentMethod: string },
    items: Array<{ name: string; quantity: number }>
  ): Promise<boolean> {
    return this.sendEmail({
      to: user.email,
      template: "purchase_confirmation",
      data: {
        username: user.username,
        transactionId: transaction.id,
        amount: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(transaction.amount),
        paymentMethod: transaction.paymentMethod.toUpperCase(),
        items
      }
    });
  }

  async sendDeliveryNotification(
    user: { username: string; email: string },
    items: Array<{ name: string; quantity: number }>
  ): Promise<boolean> {
    return this.sendEmail({
      to: user.email,
      template: "delivery_notification",
      data: {
        username: user.username,
        items
      }
    });
  }

  async sendVipActivation(
    user: { username: string; email: string },
    vipLevel: string,
    vipExpires: Date
  ): Promise<boolean> {
    return this.sendEmail({
      to: user.email,
      template: "vip_activation",
      data: {
        username: user.username,
        vipLevel: vipLevel.toUpperCase(),
        vipExpires: vipExpires.toLocaleDateString("pt-BR")
      }
    });
  }

  async testConnection(): Promise<boolean> {
    if (!this.isConfigured) {
      logger.info("Email service not configured for testing");
      return true; // Return success in development mode
    }

    try {
      await this.transporter.verify();
      logger.info("Email connection test successful");
      return true;
    } catch (error) {
      logger.error("Email connection test failed", { error: error.message });
      return false;
    }
  }
}

export const emailService = new EmailService();
