import { Request, Response } from "express";
import { storage } from "../storage";
import { logger } from "../utils/logger";
import { asyncHandler } from "../middleware/errorHandler";

export const productController = {
  getAllProducts: asyncHandler(async (req: Request, res: Response) => {
    const { 
      category, 
      type, 
      active = "true",
      page = 1, 
      limit = 20,
      search
    } = req.query as any;

    const filters: any = {};
    
    if (category) filters.category = category;
    if (type) filters.type = type;
    if (active !== "all") filters.active = active === "true";

    let products = await storage.getAllProducts(filters);

    // Apply search filter
    if (search) {
      const searchTerm = search.toLowerCase();
      products = products.filter(product => 
        product.name.toLowerCase().includes(searchTerm) ||
        product.description?.toLowerCase().includes(searchTerm) ||
        product.code.toLowerCase().includes(searchTerm)
      );
    }

    // Apply pagination
    const startIndex = (Number(page) - 1) * Number(limit);
    const endIndex = startIndex + Number(limit);
    const paginatedProducts = products.slice(startIndex, endIndex);

    res.json({
      success: true,
      products: paginatedProducts.map(product => ({
        id: product.id,
        code: product.code,
        name: product.name,
        description: product.description,
        price: product.price,
        type: product.type,
        category: product.category,
        imageUrl: product.imageUrl,
        active: product.active,
        stock: product.stock,
        createdAt: product.createdAt
      })),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: products.length,
        totalPages: Math.ceil(products.length / Number(limit))
      }
    });
  }),

  getProduct: asyncHandler(async (req: Request, res: Response) => {
    const productId = parseInt(req.params.id);
    
    const product = await storage.getProduct(productId);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json({
      success: true,
      product: {
        id: product.id,
        code: product.code,
        name: product.name,
        description: product.description,
        price: product.price,
        type: product.type,
        data: product.data,
        category: product.category,
        imageUrl: product.imageUrl,
        active: product.active,
        stock: product.stock,
        createdAt: product.createdAt
      }
    });
  }),

  getProductByCode: asyncHandler(async (req: Request, res: Response) => {
    const { code } = req.params;
    
    const product = await storage.getProductByCode(code);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json({
      success: true,
      product: {
        id: product.id,
        code: product.code,
        name: product.name,
        description: product.description,
        price: product.price,
        type: product.type,
        data: product.data,
        category: product.category,
        imageUrl: product.imageUrl,
        active: product.active,
        stock: product.stock,
        createdAt: product.createdAt
      }
    });
  }),

  getCategories: asyncHandler(async (req: Request, res: Response) => {
    const categories = await storage.getProductCategories();
    
    res.json({
      success: true,
      categories
    });
  }),

  getFeaturedProducts: asyncHandler(async (req: Request, res: Response) => {
    const { limit = 10 } = req.query as any;

    // Get active products sorted by price (featured logic can be customized)
    const allProducts = await storage.getAllProducts({ active: true });
    
    // For now, feature highest priced items (you can customize this logic)
    const featuredProducts = allProducts
      .sort((a, b) => b.price - a.price)
      .slice(0, Number(limit));

    res.json({
      success: true,
      products: featuredProducts.map(product => ({
        id: product.id,
        code: product.code,
        name: product.name,
        description: product.description,
        price: product.price,
        type: product.type,
        category: product.category,
        imageUrl: product.imageUrl,
        stock: product.stock
      }))
    });
  }),

  getProductTypes: asyncHandler(async (req: Request, res: Response) => {
    const products = await storage.getAllProducts({ active: true });
    
    // Get unique types
    const types = [...new Set(products.map(p => p.type))];
    
    // Add type information
    const typeInfo = types.map(type => {
      const typeProducts = products.filter(p => p.type === type);
      return {
        type,
        count: typeProducts.length,
        minPrice: Math.min(...typeProducts.map(p => p.price)),
        maxPrice: Math.max(...typeProducts.map(p => p.price))
      };
    });

    res.json({
      success: true,
      types: typeInfo
    });
  }),

  getProductStats: asyncHandler(async (req: Request, res: Response) => {
    const products = await storage.getAllProducts();
    const activeProducts = products.filter(p => p.active);
    
    const stats = {
      total: products.length,
      active: activeProducts.length,
      inactive: products.length - activeProducts.length,
      byType: {} as Record<string, number>,
      byCategory: {} as Record<string, number>,
      averagePrice: 0,
      totalValue: 0
    };

    // Calculate stats
    activeProducts.forEach(product => {
      // Count by type
      stats.byType[product.type] = (stats.byType[product.type] || 0) + 1;
      
      // Count by category
      if (product.category) {
        stats.byCategory[product.category] = (stats.byCategory[product.category] || 0) + 1;
      }
      
      // Add to total value
      stats.totalValue += product.price;
    });

    // Calculate average price
    stats.averagePrice = activeProducts.length > 0 ? stats.totalValue / activeProducts.length : 0;

    res.json({
      success: true,
      stats
    });
  }),

  checkStock: asyncHandler(async (req: Request, res: Response) => {
    const productId = parseInt(req.params.id);
    const { quantity = 1 } = req.query as any;
    
    const product = await storage.getProduct(productId);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    if (!product.active) {
      return res.status(400).json({ 
        error: "Product is not available",
        available: false,
        stock: 0
      });
    }

    const requestedQuantity = Number(quantity);
    const available = product.stock === -1 || product.stock >= requestedQuantity;

    res.json({
      success: true,
      available,
      stock: product.stock,
      requested: requestedQuantity,
      unlimited: product.stock === -1
    });
  }),

  searchProducts: asyncHandler(async (req: Request, res: Response) => {
    const { q: query, limit = 20 } = req.query as any;

    if (!query || query.length < 2) {
      return res.status(400).json({ error: "Search query must be at least 2 characters" });
    }

    const allProducts = await storage.getAllProducts({ active: true });
    const searchTerm = query.toLowerCase();
    
    const filteredProducts = allProducts
      .filter(product => 
        product.name.toLowerCase().includes(searchTerm) ||
        product.description?.toLowerCase().includes(searchTerm) ||
        product.code.toLowerCase().includes(searchTerm) ||
        product.category?.toLowerCase().includes(searchTerm)
      )
      .slice(0, Number(limit));

    res.json({
      success: true,
      products: filteredProducts.map(product => ({
        id: product.id,
        code: product.code,
        name: product.name,
        description: product.description,
        price: product.price,
        type: product.type,
        category: product.category,
        imageUrl: product.imageUrl
      })),
      total: filteredProducts.length
    });
  })
};
