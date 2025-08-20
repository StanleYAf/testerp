import { Request, Response } from "express";
import { storage } from "../storage";
import { CryptoUtils } from "../utils/crypto";
import { generateToken } from "../middleware/auth";
import { emailService } from "../services/emailService";
import { logger } from "../utils/logger";
import { asyncHandler } from "../middleware/errorHandler";
import type { User } from "@shared/schema";

export const authController = {
  register: asyncHandler(async (req: Request, res: Response) => {
    const { username, email, password, fivemIdentifier, discordId } = req.body;

    // Check if user already exists
    const existingUser = await storage.getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: "User with this email already exists" });
    }

    const existingUsername = await storage.getUserByUsername(username);
    if (existingUsername) {
      return res.status(400).json({ error: "Username already taken" });
    }

    // Hash password
    const passwordHash = await CryptoUtils.hashPassword(password);

    // Create user
    const newUser = await storage.createUser({
      username,
      email,
      passwordHash,
      fivemIdentifier,
      discordId,
      role: "user"
    });

    // Log activity
    await storage.logActivity({
      userId: newUser.id,
      action: "user_registered",
      details: { username, email, fivemIdentifier },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    // Send welcome email
    emailService.sendWelcomeEmail({
      username: newUser.username,
      email: newUser.email,
      fivemIdentifier: newUser.fivemIdentifier || undefined
    });

    // Generate token
    const token = generateToken(newUser);

    // Return user data without password
    const { passwordHash: _, ...userWithoutPassword } = newUser;

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      user: userWithoutPassword,
      token
    });
  }),

  login: asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    // Find user
    const user = await storage.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Check if user is banned
    if (user.banned) {
      return res.status(403).json({ error: "Account is banned" });
    }

    // Verify password
    const isValidPassword = await CryptoUtils.comparePassword(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Update last login
    await storage.updateUser(user.id, { updatedAt: new Date() });

    // Log activity
    await storage.logActivity({
      userId: user.id,
      action: "user_login",
      details: { email },
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    // Generate token
    const token = generateToken(user);

    // Return user data without password
    const { passwordHash: _, ...userWithoutPassword } = user;

    res.json({
      success: true,
      message: "Login successful",
      user: userWithoutPassword,
      token
    });
  }),

  me: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    // Get fresh user data
    const user = await storage.getUser(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Return user data without password
    const { passwordHash: _, ...userWithoutPassword } = user;

    res.json({
      success: true,
      user: userWithoutPassword
    });
  }),

  updateProfile: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { username, fivemIdentifier, discordId } = req.body;
    const updates: Partial<User> = {};

    if (username && username !== req.user.username) {
      // Check if username is already taken
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser && existingUser.id !== req.user.id) {
        return res.status(400).json({ error: "Username already taken" });
      }
      updates.username = username;
    }

    if (fivemIdentifier !== undefined) {
      updates.fivemIdentifier = fivemIdentifier;
    }

    if (discordId !== undefined) {
      updates.discordId = discordId;
    }

    // Update user
    const updatedUser = await storage.updateUser(req.user.id, updates);
    if (!updatedUser) {
      return res.status(404).json({ error: "User not found" });
    }

    // Log activity
    await storage.logActivity({
      userId: req.user.id,
      action: "profile_updated",
      details: updates,
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    // Return updated user data without password
    const { passwordHash: _, ...userWithoutPassword } = updatedUser;

    res.json({
      success: true,
      message: "Profile updated successfully",
      user: userWithoutPassword
    });
  }),

  changePassword: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { currentPassword, newPassword } = req.body;

    // Get current user data
    const user = await storage.getUser(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Verify current password
    const isValidPassword = await CryptoUtils.comparePassword(currentPassword, user.passwordHash);
    if (!isValidPassword) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    // Hash new password
    const newPasswordHash = await CryptoUtils.hashPassword(newPassword);

    // Update password
    await storage.updateUser(user.id, { passwordHash: newPasswordHash });

    // Log activity
    await storage.logActivity({
      userId: user.id,
      action: "password_changed",
      details: {},
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    res.json({
      success: true,
      message: "Password changed successfully"
    });
  }),

  logout: asyncHandler(async (req: Request, res: Response) => {
    if (req.user) {
      // Log activity
      await storage.logActivity({
        userId: req.user.id,
        action: "user_logout",
        details: {},
        ipAddress: req.ip,
        userAgent: req.get("User-Agent")
      });
    }

    res.json({
      success: true,
      message: "Logged out successfully"
    });
  }),

  refreshToken: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    // Get fresh user data
    const user = await storage.getUser(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.banned) {
      return res.status(403).json({ error: "Account is banned" });
    }

    // Generate new token
    const token = generateToken(user);

    res.json({
      success: true,
      token
    });
  })
};
