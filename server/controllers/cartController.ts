import { Request, Response } from "express";
import { storage } from "../storage";
import { logger } from "../utils/logger";
import { asyncHandler } from "../middleware/errorHandler";

export const cartController = {
  getCart: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const cartItems = await storage.getCartItems(req.user.id);
    
    // Get product details for each cart item
    const cartWithProducts = await Promise.all(
      cartItems.map(async (item) => {
        const product = await storage.getProduct(item.productId);
        if (!product) {
          return null;
        }

        return {
          id: item.id,
          quantity: item.quantity,
          createdAt: item.createdAt,
          product: {
            id: product.id,
            code: product.code,
            name: product.name,
            description: product.description,
            price: product.price,
            type: product.type,
            category: product.category,
            imageUrl: product.imageUrl,
            active: product.active,
            stock: product.stock
          },
          subtotal: product.price * item.quantity
        };
      })
    );

    // Filter out null items (products that don't exist)
    const validCartItems = cartWithProducts.filter(item => item !== null);

    // Calculate totals
    const total = validCartItems.reduce((sum, item) => sum + item.subtotal, 0);
    const itemCount = validCartItems.reduce((sum, item) => sum + item.quantity, 0);

    res.json({
      success: true,
      cart: {
        items: validCartItems,
        summary: {
          itemCount,
          total,
          currency: "BRL"
        }
      }
    });
  }),

  addToCart: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { productId, quantity = 1 } = req.body;

    // Validate product exists and is active
    const product = await storage.getProduct(productId);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    if (!product.active) {
      return res.status(400).json({ error: "Product is not available" });
    }

    // Check stock availability
    if (product.stock !== -1 && product.stock < quantity) {
      return res.status(400).json({ 
        error: "Insufficient stock",
        available: product.stock,
        requested: quantity
      });
    }

    // Add to cart
    const cartItem = await storage.addToCart({
      userId: req.user.id,
      productId,
      quantity
    });

    // Log activity
    await storage.logActivity({
      userId: req.user.id,
      action: "cart_item_added",
      details: { 
        productId, 
        productName: product.name, 
        quantity,
        price: product.price
      },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    // Get product details for response
    const responseItem = {
      id: cartItem.id,
      quantity: cartItem.quantity,
      createdAt: cartItem.createdAt,
      product: {
        id: product.id,
        code: product.code,
        name: product.name,
        price: product.price,
        type: product.type,
        category: product.category,
        imageUrl: product.imageUrl
      },
      subtotal: product.price * cartItem.quantity
    };

    res.status(201).json({
      success: true,
      message: "Item added to cart",
      item: responseItem
    });
  }),

  updateCartItem: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const itemId = parseInt(req.params.id);
    const { quantity } = req.body;

    if (quantity <= 0) {
      return res.status(400).json({ error: "Quantity must be greater than 0" });
    }

    // Get cart item
    const cartItems = await storage.getCartItems(req.user.id);
    const cartItem = cartItems.find(item => item.id === itemId);
    
    if (!cartItem) {
      return res.status(404).json({ error: "Cart item not found" });
    }

    // Get product to check stock
    const product = await storage.getProduct(cartItem.productId);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Check stock availability
    if (product.stock !== -1 && product.stock < quantity) {
      return res.status(400).json({ 
        error: "Insufficient stock",
        available: product.stock,
        requested: quantity
      });
    }

    // Update cart item
    const updatedItem = await storage.updateCartItem(itemId, quantity);
    if (!updatedItem) {
      return res.status(404).json({ error: "Failed to update cart item" });
    }

    // Log activity
    await storage.logActivity({
      userId: req.user.id,
      action: "cart_item_updated",
      details: { 
        itemId,
        productName: product.name,
        oldQuantity: cartItem.quantity,
        newQuantity: quantity
      },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    res.json({
      success: true,
      message: "Cart item updated",
      item: {
        id: updatedItem.id,
        quantity: updatedItem.quantity,
        product: {
          id: product.id,
          name: product.name,
          price: product.price
        },
        subtotal: product.price * updatedItem.quantity
      }
    });
  }),

  removeFromCart: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const itemId = parseInt(req.params.id);

    // Get cart item for logging
    const cartItems = await storage.getCartItems(req.user.id);
    const cartItem = cartItems.find(item => item.id === itemId);
    
    if (!cartItem) {
      return res.status(404).json({ error: "Cart item not found" });
    }

    // Remove from cart
    const removed = await storage.removeFromCart(itemId);
    if (!removed) {
      return res.status(404).json({ error: "Failed to remove cart item" });
    }

    // Get product for logging
    const product = await storage.getProduct(cartItem.productId);

    // Log activity
    await storage.logActivity({
      userId: req.user.id,
      action: "cart_item_removed",
      details: { 
        itemId,
        productName: product?.name || "Unknown Product",
        quantity: cartItem.quantity
      },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    res.json({
      success: true,
      message: "Item removed from cart"
    });
  }),

  clearCart: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Get cart items count for logging
    const cartItems = await storage.getCartItems(req.user.id);
    const itemCount = cartItems.length;

    const cleared = await storage.clearCart(req.user.id);
    if (!cleared) {
      return res.status(500).json({ error: "Failed to clear cart" });
    }

    // Log activity
    await storage.logActivity({
      userId: req.user.id,
      action: "cart_cleared",
      details: { itemCount },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    res.json({
      success: true,
      message: "Cart cleared successfully"
    });
  }),

  getCartStats: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const cartItems = await storage.getCartItems(req.user.id);
    
    // Calculate stats
    let totalItems = 0;
    let totalValue = 0;
    const itemsByType: Record<string, number> = {};

    for (const item of cartItems) {
      const product = await storage.getProduct(item.productId);
      if (product) {
        totalItems += item.quantity;
        totalValue += product.price * item.quantity;
        itemsByType[product.type] = (itemsByType[product.type] || 0) + item.quantity;
      }
    }

    res.json({
      success: true,
      stats: {
        totalItems,
        totalValue,
        uniqueProducts: cartItems.length,
        itemsByType,
        currency: "BRL"
      }
    });
  }),

  validateCart: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const cartItems = await storage.getCartItems(req.user.id);
    const issues: Array<{
      itemId: number;
      productId: number;
      issue: string;
      severity: "warning" | "error";
    }> = [];

    let totalValue = 0;
    let validItems = 0;

    for (const item of cartItems) {
      const product = await storage.getProduct(item.productId);
      
      if (!product) {
        issues.push({
          itemId: item.id,
          productId: item.productId,
          issue: "Product no longer exists",
          severity: "error"
        });
        continue;
      }

      if (!product.active) {
        issues.push({
          itemId: item.id,
          productId: item.productId,
          issue: "Product is no longer available",
          severity: "error"
        });
        continue;
      }

      if (product.stock !== -1 && product.stock < item.quantity) {
        issues.push({
          itemId: item.id,
          productId: item.productId,
          issue: `Only ${product.stock} items in stock, but ${item.quantity} requested`,
          severity: "error"
        });
        continue;
      }

      // Valid item
      validItems++;
      totalValue += product.price * item.quantity;
    }

    const isValid = issues.filter(issue => issue.severity === "error").length === 0;

    res.json({
      success: true,
      validation: {
        isValid,
        issues,
        validItems,
        totalItems: cartItems.length,
        totalValue,
        canCheckout: isValid && validItems > 0
      }
    });
  })
};
