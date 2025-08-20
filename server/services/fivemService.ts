import axios from "axios";
import { logger } from "../utils/logger";

export interface FivemServerInfo {
  online: boolean;
  players: number;
  maxPlayers: number;
  version: string;
  resources: string[];
}

export interface FivemPlayerInfo {
  id: number;
  name: string;
  identifier: string;
  ping: number;
  online: boolean;
}

export interface GrantDeliveryData {
  userIdentifier: string;
  grantType: string;
  grantData: any;
  transactionId?: string;
}

export interface DeliveryResult {
  success: boolean;
  message: string;
  delivered: boolean;
  retryAfter?: number;
}

export class FivemService {
  private serverUrl: string;
  private serverToken: string;
  private retryAttempts: number = 3;
  private retryDelay: number = 5000; // 5 seconds

  constructor() {
    this.serverUrl = process.env.FIVEM_SERVER_URL || "http://localhost:30120";
    this.serverToken = process.env.FIVEM_SERVER_TOKEN || "";

    if (!this.serverToken) {
      logger.warn("FiveM server token not configured, using mock mode");
    }
  }

  private async makeRequest(endpoint: string, data?: any, method: string = "GET"): Promise<any> {
    if (!this.serverToken) {
      // Mock responses for development
      return this.getMockResponse(endpoint, data, method);
    }

    try {
      const config = {
        method,
        url: `${this.serverUrl}${endpoint}`,
        headers: {
          "Authorization": `Bearer ${this.serverToken}`,
          "Content-Type": "application/json",
          "User-Agent": "FiveM-Store-API/1.0"
        },
        data: method !== "GET" ? data : undefined,
        timeout: 10000 // 10 second timeout
      };

      const response = await axios(config);
      return response.data;
    } catch (error) {
      logger.error("FiveM server request failed", { 
        endpoint, 
        method, 
        error: error.message,
        serverUrl: this.serverUrl 
      });
      
      if (axios.isAxiosError(error)) {
        if (error.code === "ECONNREFUSED") {
          throw new Error("FiveM server is offline or unreachable");
        }
        if (error.response?.status === 401) {
          throw new Error("Invalid FiveM server token");
        }
        if (error.response?.status === 404) {
          throw new Error("FiveM endpoint not found - ensure the store resource is running");
        }
      }
      
      throw new Error(`FiveM server error: ${error.message}`);
    }
  }

  private getMockResponse(endpoint: string, data?: any, method: string = "GET"): any {
    logger.info("FiveM mock response", { endpoint, method, data });

    if (endpoint === "/store/status") {
      return {
        online: true,
        players: 127,
        maxPlayers: 200,
        version: "1.0.0",
        resources: ["store-api", "es_extended", "mysql-async"]
      };
    }

    if (endpoint.includes("/store/player/") && endpoint.includes("/online")) {
      return {
        online: Math.random() > 0.3, // 70% chance of being online
        id: Math.floor(Math.random() * 1000),
        name: "MockPlayer",
        identifier: data?.identifier || "steam:110000103fa1337",
        ping: Math.floor(Math.random() * 100)
      };
    }

    if (endpoint === "/store/deliver" && method === "POST") {
      return {
        success: true,
        message: "Items delivered successfully",
        delivered: true,
        playerOnline: Math.random() > 0.2 // 80% chance of successful delivery
      };
    }

    if (endpoint.includes("/store/player/") && endpoint.includes("/kick")) {
      return {
        success: true,
        message: "Player kicked successfully"
      };
    }

    return { success: true };
  }

  async getServerStatus(): Promise<FivemServerInfo> {
    try {
      const response = await this.makeRequest("/store/status");
      return {
        online: response.online || true,
        players: response.players || 0,
        maxPlayers: response.maxPlayers || 32,
        version: response.version || "unknown",
        resources: response.resources || []
      };
    } catch (error) {
      logger.error("Failed to get FiveM server status", { error });
      return {
        online: false,
        players: 0,
        maxPlayers: 0,
        version: "unknown",
        resources: []
      };
    }
  }

  async isPlayerOnline(identifier: string): Promise<FivemPlayerInfo | null> {
    try {
      const response = await this.makeRequest(`/store/player/${encodeURIComponent(identifier)}/online`);
      
      if (response.online) {
        return {
          id: response.id,
          name: response.name,
          identifier: response.identifier,
          ping: response.ping,
          online: true
        };
      }
      
      return null;
    } catch (error) {
      logger.error("Failed to check player online status", { error, identifier });
      return null;
    }
  }

  async deliverItems(deliveryData: GrantDeliveryData): Promise<DeliveryResult> {
    try {
      const response = await this.makeRequest("/store/deliver", {
        identifier: deliveryData.userIdentifier,
        type: deliveryData.grantType,
        data: deliveryData.grantData,
        transactionId: deliveryData.transactionId
      }, "POST");

      if (response.success) {
        logger.info("Items delivered successfully", { 
          identifier: deliveryData.userIdentifier,
          type: deliveryData.grantType,
          transactionId: deliveryData.transactionId
        });

        return {
          success: true,
          message: response.message || "Items delivered successfully",
          delivered: true
        };
      } else {
        // Player might be offline or delivery failed
        const retryAfter = response.playerOnline === false ? 300 : 60; // 5 minutes if offline, 1 minute otherwise
        
        return {
          success: false,
          message: response.message || "Failed to deliver items",
          delivered: false,
          retryAfter
        };
      }
    } catch (error) {
      logger.error("Failed to deliver items", { 
        error, 
        deliveryData 
      });

      return {
        success: false,
        message: error.message || "Server communication error",
        delivered: false,
        retryAfter: 60 // Retry in 1 minute
      };
    }
  }

  async deliverItemsWithRetry(deliveryData: GrantDeliveryData): Promise<DeliveryResult> {
    let lastResult: DeliveryResult;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      logger.info(`Delivery attempt ${attempt}/${this.retryAttempts}`, { 
        identifier: deliveryData.userIdentifier,
        type: deliveryData.grantType
      });

      lastResult = await this.deliverItems(deliveryData);

      if (lastResult.delivered) {
        return lastResult;
      }

      if (attempt < this.retryAttempts) {
        logger.info(`Delivery failed, retrying in ${this.retryDelay}ms`, { 
          attempt,
          error: lastResult.message
        });
        
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
      }
    }

    logger.error("All delivery attempts failed", { 
      deliveryData,
      finalResult: lastResult
    });

    return lastResult!;
  }

  async kickPlayer(identifier: string, reason: string = "Kicked by admin"): Promise<boolean> {
    try {
      const response = await this.makeRequest(`/store/player/${encodeURIComponent(identifier)}/kick`, {
        reason
      }, "POST");

      return response.success || false;
    } catch (error) {
      logger.error("Failed to kick player", { error, identifier, reason });
      return false;
    }
  }

  async sendMessage(identifier: string, message: string): Promise<boolean> {
    try {
      const response = await this.makeRequest(`/store/player/${encodeURIComponent(identifier)}/message`, {
        message
      }, "POST");

      return response.success || false;
    } catch (error) {
      logger.error("Failed to send message to player", { error, identifier, message });
      return false;
    }
  }

  async executeCommand(command: string): Promise<any> {
    try {
      const response = await this.makeRequest("/store/command", {
        command
      }, "POST");

      return response;
    } catch (error) {
      logger.error("Failed to execute command", { error, command });
      throw error;
    }
  }

  isConfigured(): boolean {
    return !!(this.serverUrl && this.serverToken);
  }

  formatIdentifier(identifier: string): string {
    // Ensure identifier is in the correct format
    if (!identifier.includes(":")) {
      return `steam:${identifier}`;
    }
    return identifier;
  }

  validateIdentifier(identifier: string): boolean {
    const validPrefixes = ["steam", "license", "discord", "fivem", "live", "xbl"];
    const [prefix] = identifier.split(":");
    return validPrefixes.includes(prefix);
  }
}

export const fivemService = new FivemService();
