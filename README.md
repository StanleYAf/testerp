# FiveM Store API

A complete REST API for FiveM game stores with PIX payment integration, user management, shopping cart system, and automatic item delivery to game servers.

## 🚀 Features

### Core Features
- **Complete REST API** with JSON responses
- **User Authentication** with JWT tokens and role-based access control
- **Product Catalog** with categories, types, and inventory management
- **Shopping Cart System** with full CRUD operations
- **PIX Payment Integration** via EfiBank
- **Webhook System** for payment confirmations
- **Admin Panel** with comprehensive management tools
- **FiveM Server Integration** for instant item delivery
- **Transaction Tracking** and grant management system
- **Activity Logging** and analytics

### Security Features
- JWT token authentication with refresh tokens
- Rate limiting on all endpoints
- Input validation with Zod schemas
- Password hashing with bcrypt
- Security headers with Helmet
- CORS configuration
- Comprehensive error handling
- Activity logging for audit trails

### Payment System
- PIX payment integration with QR code generation
- Real-time payment status updates via webhooks
- Automatic order processing after payment confirmation
- Support for payment cancellation
- Transaction history and analytics

### FiveM Integration
- Automatic item delivery to online players
- Retry mechanism for offline players
- Support for multiple item types (coins, VIP, vehicles, weapons, items)
- Server status monitoring
- Player management (kick, message, etc.)

## 📋 Prerequisites

- Node.js 18+ 
- SQLite 3
- FiveM server with compatible resource
- EfiBank account for PIX payments (optional for development)
- SMTP server for email notifications (optional)

## 🛠️ Installation

### Quick Start (Replit)

1. Fork this repository to Replit
2. Copy `.env.example` to `.env` and configure your settings
3. Run the following commands:

```bash
# Install dependencies
npm install

# Run database migrations
npm run migrate

# Seed initial data
npm run seed

# Start the server
npm run dev
```

### Manual Setup

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Configure your environment:
   - Copy `.env.example` to `.env`
   - Update the required environment variables (see Configuration section)

4. Push database schema:
```bash
npm run db:push
```

5. Seed the database with initial data:
```bash
NODE_ENV=development tsx scripts/seed.ts
```

6. Start the development server:
```bash
npm run dev
```

The server will be running on `http://localhost:5000` by default.

## 🔧 Configuration

### Required Environment Variables

To run this API in production, you'll need to set up these required environment variables:

```env
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-at-least-32-chars

# Super Admin Account
SUPER_ADMIN_EMAIL=your-admin@email.com
SUPER_ADMIN_PASSWORD=your-secure-admin-password

# EfiBank PIX Integration (for production payments)
EFI_CLIENT_ID=your-efibank-client-id
EFI_CLIENT_SECRET=your-efibank-client-secret
EFI_PIX_KEY=your-pix-key

# FiveM Server Integration
FIVEM_SERVER_URL=http://your-fivem-server-ip:30120
FIVEM_SERVER_TOKEN=your-fivem-server-api-token
```

### Optional Configuration

```env
# Email Notifications (Optional)
EMAIL_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Database (uses SQLite by default)
DATABASE_URL=./database.sqlite

# Server Settings
PORT=5000
NODE_ENV=production
```

## 📚 API Documentation

### Base URL
```
http://localhost:5000/api
```

### Admin Credentials (Default)
- **Email:** `admin@sua-loja.com`
- **Password:** `senha-admin-segura`

### Quick API Test

1. **Health Check:**
```bash
curl http://localhost:5000/api/health
```

2. **Get Products:**
```bash
curl http://localhost:5000/api/products
```

3. **Admin Login:**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@sua-loja.com", "password": "senha-admin-segura"}'
```

4. **View All Users (Admin Only):**
```bash
curl http://localhost:5000/api/admin/users \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Available Endpoints

#### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user info
- `PUT /api/auth/me` - Update profile
- `POST /api/auth/change-password` - Change password

#### Products
- `GET /api/products` - List all products
- `GET /api/products/:id` - Get specific product
- `GET /api/products/code/:code` - Get product by code
- `GET /api/products/categories` - Get product categories
- `GET /api/products/featured` - Get featured products

#### Shopping Cart
- `GET /api/cart` - Get user's cart
- `POST /api/cart/add` - Add item to cart
- `PUT /api/cart/item/:id` - Update cart item
- `DELETE /api/cart/item/:id` - Remove cart item
- `DELETE /api/cart/clear` - Clear entire cart

#### Payments (PIX)
- `POST /api/payments/create` - Create PIX payment
- `GET /api/payments/:id` - Get payment status
- `POST /api/payments/:id/cancel` - Cancel payment

#### Admin Panel (Super Admin Only)
- `GET /api/admin/users` - List all users
- `PUT /api/admin/users/:id/ban` - Ban user
- `PUT /api/admin/users/:id/unban` - Unban user
- `POST /api/admin/products` - Create product
- `PUT /api/admin/products/:id` - Update product
- `DELETE /api/admin/products/:id` - Delete product
- `GET /api/admin/transactions` - View transactions
- `GET /api/admin/analytics` - Get analytics data

#### FiveM Integration
- `POST /api/server/deliver` - Deliver items to FiveM server
- `GET /api/server/user/:identifier/online` - Check if player is online
- `POST /api/server/user/:identifier/kick` - Kick player
- `GET /api/server/status` - Get FiveM server status

### Sample Product Categories

The API comes pre-loaded with sample products:

- **Coins** - Virtual currency (COINS_100, COINS_500, COINS_1000)
- **VIP Memberships** - Bronze, Silver, Gold, Diamond (30-day packages)
- **Vehicles** - Sports cars, motorcycles, luxury SUVs
- **Weapons** - Golden pistols, tactical rifles
- **Items** - Lockpick kits, medical kits, tools

## 🚀 Deployment

### Using Replit Deployments

1. Click the "Deploy" button in Replit
2. Configure your environment variables in the deployment settings
3. Your API will be available at `https://your-repl-name.your-username.replit.app`

### Production Considerations

1. **Security:**
   - Change default admin credentials
   - Use strong JWT secrets (32+ characters)
   - Enable HTTPS in production
   - Configure proper CORS settings

2. **Database:**
   - For high traffic, consider migrating to PostgreSQL
   - Enable database backups
   - Monitor disk usage

3. **External Services:**
   - Set up real EfiBank credentials for PIX payments
   - Configure SMTP for email notifications
   - Set up FiveM server integration

4. **Monitoring:**
   - Enable logging in production
   - Monitor API performance
   - Set up health check alerts

## 🤝 Integration

### FiveM Server Setup

To integrate with your FiveM server, you'll need to:

1. Install the companion resource on your FiveM server
2. Configure the server token in your environment
3. Set up webhook endpoints for real-time communication

### Frontend Integration

This API provides a complete REST interface that can be consumed by:
- React/Vue/Angular web applications
- Mobile apps (React Native, Flutter)
- Desktop applications
- Other services via webhooks

## 🆘 Troubleshooting

### Common Issues

1. **Database Issues:**
```bash
# Reset database
rm database.sqlite
npm run db:push
NODE_ENV=development tsx scripts/seed.ts
```

2. **Port Already in Use:**
```bash
# Change port in environment
export PORT=3000
npm run dev
```

3. **Authentication Issues:**
   - Check JWT_SECRET is set
   - Verify admin credentials
   - Check token expiration

### Support

For issues and support:
1. Check the logs in `./logs/` directory
2. Review error messages in console
3. Verify environment configuration
4. Check FiveM server connectivity

## 📄 License

MIT License - feel free to use this project for your FiveM server!
