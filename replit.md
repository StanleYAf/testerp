# Overview

FiveM Store API is a comprehensive REST API system designed for FiveM gaming servers that need an integrated store solution. The system handles product catalog management, user authentication, shopping cart functionality, PIX payment processing via EfiBank, and automatic item delivery to FiveM game servers. It features a complete backend API with webhook support for real-time payment confirmations and automated grant delivery to online players.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Backend Architecture

**Framework & Runtime**: Express.js with TypeScript running on Node.js, providing a robust REST API foundation with type safety and modern JavaScript features.

**Database Layer**: Uses Drizzle ORM with SQLite as the primary database, configured to potentially migrate to PostgreSQL through Neon Database serverless. The storage abstraction layer provides a clean interface for all database operations including users, products, transactions, cart items, and activity logging.

**Authentication & Security**: JWT-based authentication with role-based access control (user, admin, super_admin). Implements comprehensive security measures including rate limiting (different limits for auth, payments, admin operations), input validation with Zod schemas, password hashing with bcrypt, and security headers via Helmet.

**Payment Processing**: Integrates with EfiBank for PIX payment processing, featuring QR code generation, webhook handling for payment confirmations, and automatic order processing. Supports payment status tracking and retry mechanisms for failed deliveries.

**FiveM Integration**: Direct server integration for automatic item delivery using HTTP-based communication. Handles different item types (coins, VIP status, vehicles, weapons, items) with retry logic for offline players and delivery status tracking.

## Frontend Architecture

**Framework**: React 18 with TypeScript using Vite as the build tool and development server.

**UI Components**: Utilizes Radix UI primitives with shadcn/ui component library for consistent, accessible interface components. Styled with Tailwind CSS using a custom design system with CSS variables for theming.

**State Management**: TanStack Query (React Query) for server state management, API caching, and synchronization. Custom hooks for mobile responsiveness and toast notifications.

**Routing**: Wouter for lightweight client-side routing with a fallback 404 page structure.

## API Design Patterns

**RESTful Endpoints**: Organized by resource type (auth, users, products, cart, payments, admin, server) with consistent response formats and error handling.

**Middleware Architecture**: Layered middleware approach including authentication, validation, rate limiting, and error handling. Supports optional authentication for public endpoints.

**Error Handling**: Centralized error handling with custom error classes, comprehensive logging, and standardized error responses. Different error handling strategies for operational vs system errors.

**Validation**: Zod-based schema validation for request bodies, query parameters, and route parameters with detailed error messages.

## Data Model

**User Management**: Comprehensive user profiles with FiveM identifiers, Discord integration, VIP status tracking, and activity logging.

**Product Catalog**: Flexible product system supporting multiple types (coins, VIP, vehicles, weapons, items) with categories, stock management, and JSON-based configuration data.

**Transaction System**: Complete transaction lifecycle tracking from cart to payment to delivery, with status management and grant processing.

**Activity Logging**: Audit trail system for tracking user actions, admin operations, and system events with IP and user agent tracking.

# External Dependencies

## Database & ORM
- **Drizzle ORM**: Database abstraction layer with TypeScript support
- **better-sqlite3**: SQLite database driver for local development
- **@neondatabase/serverless**: PostgreSQL serverless connection for production

## Payment Processing
- **EfiBank API**: Brazilian PIX payment gateway integration
- **QRCode generation**: For PIX payment QR codes
- **Webhook signature verification**: Payment confirmation security

## Authentication & Security
- **jsonwebtoken**: JWT token generation and verification
- **bcryptjs**: Password hashing and verification
- **helmet**: Security headers middleware
- **express-rate-limit**: API rate limiting protection

## Communication Services
- **nodemailer**: Email service for notifications and user communications
- **FiveM Server API**: HTTP-based integration for item delivery and player management

## Development & Build Tools
- **Vite**: Frontend build tool and development server
- **TypeScript**: Type safety across the entire application
- **Winston**: Structured logging system
- **Express.js**: Backend web framework

## Frontend UI Framework
- **React 18**: Frontend framework with hooks and modern patterns
- **Radix UI**: Accessible component primitives
- **Tailwind CSS**: Utility-first CSS framework
- **TanStack Query**: Server state management and caching