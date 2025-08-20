import { storage } from "../server/storage";
import { CryptoUtils } from "../server/utils/crypto";
import { logger } from "../server/utils/logger";
import { serverConfig } from "../server/config/server";

async function seedDatabase() {
  try {
    logger.info("Starting database seeding...");

    // Check if data already exists
    const userCount = await storage.getUserCount();
    const productCount = await storage.getProductCount();

    if (userCount > 0 || productCount > 0) {
      logger.info(`Database already contains data (${userCount} users, ${productCount} products). Skipping seed.`);
      return;
    }

    // Create super admin user
    await createSuperAdmin();

    // Create sample products
    await createSampleProducts();

    logger.info("Database seeding completed successfully");

  } catch (error) {
    logger.error("Database seeding failed", { error });
    throw error;
  }
}

async function createSuperAdmin() {
  try {
    const adminEmail = serverConfig.admin.email;
    const adminPassword = serverConfig.admin.password;

    // Check if admin already exists
    const existingAdmin = await storage.getUserByEmail(adminEmail);
    if (existingAdmin) {
      logger.info("Super admin user already exists");
      return;
    }

    // Hash password
    const passwordHash = await CryptoUtils.hashPassword(adminPassword);

    // Create super admin user
    const admin = await storage.createUser({
      username: "admin",
      email: adminEmail,
      passwordHash,
      role: "super_admin",
      coins: 0,
      vipLevel: "diamond"
    });

    logger.info(`Super admin created successfully with ID: ${admin.id}`);

    // Log activity
    await storage.logActivity({
      userId: admin.id,
      action: "super_admin_created",
      details: { 
        email: adminEmail,
        createdDuringSeeding: true
      },
      ipAddress: "127.0.0.1",
      userAgent: "database-seed"
    });

  } catch (error) {
    logger.error("Failed to create super admin", { error });
    throw error;
  }
}

async function createSampleProducts() {
  try {
    const sampleProducts = [
      // Coins
      {
        code: "COINS_100",
        name: "100 Coins",
        description: "Basic coin package for in-game purchases",
        price: 5.00,
        type: "coins" as const,
        category: "currency",
        data: { amount: 100 },
        active: true,
        stock: -1,
        imageUrl: "https://example.com/coins-100.jpg"
      },
      {
        code: "COINS_500",
        name: "500 Coins",
        description: "Popular coin package with bonus coins",
        price: 20.00,
        type: "coins" as const,
        category: "currency",
        data: { amount: 500, bonus: 50 },
        active: true,
        stock: -1,
        imageUrl: "https://example.com/coins-500.jpg"
      },
      {
        code: "COINS_1000",
        name: "1000 Coins",
        description: "Premium coin package with maximum value",
        price: 35.00,
        type: "coins" as const,
        category: "currency",
        data: { amount: 1000, bonus: 150 },
        active: true,
        stock: -1,
        imageUrl: "https://example.com/coins-1000.jpg"
      },

      // VIP Packages
      {
        code: "VIP_BRONZE_30D",
        name: "VIP Bronze (30 days)",
        description: "Bronze VIP membership with basic perks for 30 days",
        price: 15.00,
        type: "vip" as const,
        category: "membership",
        data: { level: "bronze", duration: 30 },
        active: true,
        stock: -1,
        imageUrl: "https://example.com/vip-bronze.jpg"
      },
      {
        code: "VIP_SILVER_30D",
        name: "VIP Silver (30 days)",
        description: "Silver VIP membership with enhanced perks for 30 days",
        price: 30.00,
        type: "vip" as const,
        category: "membership",
        data: { level: "silver", duration: 30 },
        active: true,
        stock: -1,
        imageUrl: "https://example.com/vip-silver.jpg"
      },
      {
        code: "VIP_GOLD_30D",
        name: "VIP Gold (30 days)",
        description: "Gold VIP membership with premium perks for 30 days",
        price: 50.00,
        type: "vip" as const,
        category: "membership",
        data: { level: "gold", duration: 30 },
        active: true,
        stock: -1,
        imageUrl: "https://example.com/vip-gold.jpg"
      },
      {
        code: "VIP_DIAMOND_30D",
        name: "VIP Diamond (30 days)",
        description: "Diamond VIP membership with all perks for 30 days",
        price: 100.00,
        type: "vip" as const,
        category: "membership",
        data: { level: "diamond", duration: 30 },
        active: true,
        stock: -1,
        imageUrl: "https://example.com/vip-diamond.jpg"
      },

      // Vehicles
      {
        code: "VEHICLE_SPORTS_1",
        name: "Sports Car Alpha",
        description: "High-performance sports car with custom paint job",
        price: 75.00,
        type: "vehicle" as const,
        category: "vehicles",
        data: { 
          model: "adder",
          customization: {
            paint: "metallic_red",
            wheels: "sport",
            engine: "max_tuned"
          }
        },
        active: true,
        stock: 50,
        imageUrl: "https://example.com/sports-car-alpha.jpg"
      },
      {
        code: "VEHICLE_MOTORCYCLE_1",
        name: "Racing Motorcycle",
        description: "Lightning-fast motorcycle for street racing",
        price: 40.00,
        type: "vehicle" as const,
        category: "vehicles",
        data: { 
          model: "akuma",
          customization: {
            paint: "matte_black",
            performance: "race_tuned"
          }
        },
        active: true,
        stock: 25,
        imageUrl: "https://example.com/racing-motorcycle.jpg"
      },
      {
        code: "VEHICLE_SUV_1",
        name: "Luxury SUV",
        description: "Spacious luxury SUV perfect for family trips",
        price: 60.00,
        type: "vehicle" as const,
        category: "vehicles",
        data: { 
          model: "huntley",
          customization: {
            paint: "pearl_white",
            interior: "luxury",
            tint: "dark"
          }
        },
        active: true,
        stock: 30,
        imageUrl: "https://example.com/luxury-suv.jpg"
      },

      // Weapons
      {
        code: "WEAPON_PISTOL_GOLD",
        name: "Golden Pistol",
        description: "Exclusive golden pistol with custom engravings",
        price: 25.00,
        type: "weapon" as const,
        category: "weapons",
        data: { 
          weapon: "weapon_pistol",
          skin: "gold",
          ammo: 500,
          attachments: ["suppressor", "flashlight"]
        },
        active: true,
        stock: 100,
        imageUrl: "https://example.com/golden-pistol.jpg"
      },
      {
        code: "WEAPON_ASSAULT_RIFLE",
        name: "Tactical Assault Rifle",
        description: "Military-grade assault rifle with tactical attachments",
        price: 150.00,
        type: "weapon" as const,
        category: "weapons",
        data: { 
          weapon: "weapon_assaultrifle",
          skin: "tactical_black",
          ammo: 1000,
          attachments: ["scope", "grip", "extended_mag"]
        },
        active: true,
        stock: 20,
        imageUrl: "https://example.com/tactical-assault-rifle.jpg"
      },

      // Items
      {
        code: "ITEM_LOCKPICK_KIT",
        name: "Professional Lockpick Kit",
        description: "High-quality lockpick set for skilled criminals",
        price: 10.00,
        type: "item" as const,
        category: "tools",
        data: { 
          item: "lockpick",
          quantity: 10,
          quality: "professional"
        },
        active: true,
        stock: 200,
        imageUrl: "https://example.com/lockpick-kit.jpg"
      },
      {
        code: "ITEM_MEDKIT_ADVANCED",
        name: "Advanced Medical Kit",
        description: "Professional medical kit for emergency situations",
        price: 20.00,
        type: "item" as const,
        category: "medical",
        data: { 
          item: "medkit",
          healing_amount: 100,
          quantity: 5
        },
        active: true,
        stock: 150,
        imageUrl: "https://example.com/advanced-medkit.jpg"
      }
    ];

    let createdCount = 0;
    for (const productData of sampleProducts) {
      try {
        const product = await storage.createProduct(productData);
        createdCount++;
        logger.info(`Created product: ${product.name} (${product.code})`);
      } catch (error) {
        logger.error(`Failed to create product ${productData.code}`, { error });
      }
    }

    logger.info(`Created ${createdCount} sample products`);

  } catch (error) {
    logger.error("Failed to create sample products", { error });
    throw error;
  }
}

async function createTestUser() {
  try {
    const testEmail = "test@fivemstore.com";
    
    // Check if test user already exists
    const existingUser = await storage.getUserByEmail(testEmail);
    if (existingUser) {
      logger.info("Test user already exists");
      return;
    }

    // Create test user
    const passwordHash = await CryptoUtils.hashPassword("test123");
    
    const testUser = await storage.createUser({
      username: "testplayer",
      email: testEmail,
      passwordHash,
      role: "user",
      fivemIdentifier: "steam:110000103fa1337",
      discordId: "123456789012345678",
      coins: 1000,
      vipLevel: "bronze"
    });

    logger.info(`Test user created successfully with ID: ${testUser.id}`);

    // Add some test items to cart
    const products = await storage.getAllProducts({ active: true });
    if (products.length > 0) {
      await storage.addToCart({
        userId: testUser.id,
        productId: products[0].id,
        quantity: 2
      });

      if (products.length > 1) {
        await storage.addToCart({
          userId: testUser.id,
          productId: products[1].id,
          quantity: 1
        });
      }

      logger.info("Added sample items to test user's cart");
    }

  } catch (error) {
    logger.error("Failed to create test user", { error });
  }
}

// Run seeding if this script is executed directly  
const runSeed = async () => {
  try {
    await seedDatabase();
    
    // Optionally create test user in development
    if (process.env.NODE_ENV === "development") {
      await createTestUser();
    }
    
    logger.info("Seeding process completed");
    process.exit(0);
  } catch (error) {
    logger.error("Seeding process failed", { error });
    process.exit(1);
  }
};

// Check if this is the main module by checking for the script being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runSeed();
}

export { seedDatabase, createSuperAdmin, createSampleProducts, createTestUser };
