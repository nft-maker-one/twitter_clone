const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000 
};


const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET || 'fallback-secret', {
    expiresIn: '7d'
  });
};


router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    
    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters long' });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores' });
    }

    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    
    const existingUser = await User.findByUsername(username);
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    
    if (email) {
      const { User: UserModel } = require('../config/database');
      const existingEmail = await UserModel.findOne({ where: { email } });
      if (existingEmail) {
        return res.status(400).json({ error: 'Email already exists' });
      }
    }

    
    const user = await User.create({ username, email, password });
    const token = generateToken(user.id);

    
    res.cookie('token', token, COOKIE_OPTIONS);
    
    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user.id,
        username: user.username,
        email: user.email || null,
        avatar_url: user.avatar_url,
        bio: user.bio,
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    
    const user = await User.findByUsername(username);
    if (!user || !user.password_hash) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    
    const isValidPassword = await User.validatePassword(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    
    const token = generateToken(user.id);

    
    res.cookie('token', token, COOKIE_OPTIONS);
    
    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        wallet_address: user.wallet_address,
        avatar_url: user.avatar_url,
        bio: user.bio,
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.post('/metamask', async (req, res) => {
  try {
    const { walletAddress, username } = req.body;

    if (!walletAddress) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }

    
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({ error: 'Invalid wallet address format' });
    }

    
    let user = await User.findByWallet(walletAddress);

    if (!user) {
      
      if (!username) {
        return res.status(400).json({ error: 'Username is required for new MetaMask users' });
      }

      
      if (username.length < 3) {
        return res.status(400).json({ error: 'Username must be at least 3 characters long' });
      }

      if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores' });
      }

      
      const existingUsername = await User.findByUsername(username);
      if (existingUsername) {
        return res.status(400).json({ error: 'Username already exists' });
      }

      
      user = await User.create({ 
        username, 
        wallet_address: walletAddress.toLowerCase() 
      });
    }

    
    const token = generateToken(user.id);

    
    res.cookie('token', token, COOKIE_OPTIONS);
    
    res.json({
      message: user.created_at ? 'Login successful' : 'Registration successful',
      user: {
        id: user.id,
        username: user.username,
        walletAddress: user.wallet_address,
        avatar_url: user.avatar_url,
        bio: user.bio,
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('MetaMask auth error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.get('/me', authMiddleware, async (req, res) => {
  try {
    
    res.json({ 
      user: {
        id: req.user.id,
        username: req.user.username,
        email: req.user.email,
        wallet_address: req.user.wallet_address,
        avatar_url: req.user.avatar_url,
        bio: req.user.bio,
        location: req.user.location,
        website: req.user.website,
        followers_count: req.user.followers_count || 0,
        following_count: req.user.following_count || 0,
        created_at: req.user.created_at
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.post('/logout', (req, res) => {
  try {
    
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });
    
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.post('/refresh', authMiddleware, async (req, res) => {
  try {
    const newToken = generateToken(req.user.id);
    
    res.cookie('token', newToken, COOKIE_OPTIONS);
    
    res.json({ 
      message: 'Token refreshed successfully',
      user: req.user
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.get('/verify', authMiddleware, (req, res) => {
  res.json({ 
    valid: true,
    user: req.user
  });
});

module.exports = router;