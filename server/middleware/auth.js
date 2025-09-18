
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authMiddleware = async (req, res, next) => {
  try {
    
    const token = req.cookies.token;

    if (!token) {
      return res.status(401).json({ 
        error: 'Access denied. No token provided.',
        code: 'NO_TOKEN'
      });
    }

    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    
    
    const user = await User.findById(decoded.userId, true);
    
    if (!user) {
      
      res.clearCookie('token');
      return res.status(401).json({ 
        error: 'User no longer exists.',
        code: 'USER_NOT_FOUND'
      });
    }

    
    req.user = user;
    next();
    
  } catch (error) {
    console.error('Auth middleware error:', error);
    
    
    res.clearCookie('token');
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid token.',
        code: 'INVALID_TOKEN'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired.',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    return res.status(500).json({ 
      error: 'Internal server error during authentication.',
      code: 'AUTH_ERROR'
    });
  }
};


const optionalAuthMiddleware = async (req, res, next) => {
  try {
    const token = req.cookies.token;

    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    const user = await User.findById(decoded.userId, true);
    
    req.user = user || null;
    next();
    
  } catch (error) {
    
    req.user = null;
    next();
  }
};

module.exports = authMiddleware;
module.exports.optionalAuth = optionalAuthMiddleware;