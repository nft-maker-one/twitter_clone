const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const cookieParser = require('cookie-parser');
require('dotenv').config();

// the router config
const { initDB } = require('./config/database');
const authRoutes = require('./routes/auth');
const postRoutes = require('./routes/posts');
const userRoutes = require('./routes/users');

// import middleware
const authMiddleware = require('./middleware/auth');
const { optionalAuth } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 5000;

// set the log for debug
const requestLogger = (req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.originalUrl} - IP: ${req.ip}`);
  next();
};

// Security middleware - cookieParser 必须在CORS前
app.use(cookieParser());


app.use(requestLogger);

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:", "http:", "ui-avatars.com"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
    },
  },
}));

// CORS 
app.use(cors({
  origin: function (origin, callback) {
    // whitelist
    const allowedOrigins = [
      process.env.CLIENT_URL || 'http://localhost:3000',
      'http://localhost:3000',
      'http://127.0.0.1:3000'
    ];
    
  
    if (!origin && process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, 
  optionsSuccessStatus: 200
}));

// Body parsing middleware
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf);
    } catch (e) {
      res.status(400).json({ error: 'Invalid JSON' });
      throw new Error('Invalid JSON');
    }
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// static file request
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '1d', 
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.jpg':
      case '.jpeg':
        res.setHeader('Content-Type', 'image/jpeg');
        break;
      case '.png':
        res.setHeader('Content-Type', 'image/png');
        break;
      case '.gif':
        res.setHeader('Content-Type', 'image/gif');
        break;
      case '.webp':
        res.setHeader('Content-Type', 'image/webp');
        break;
      default:
        res.setHeader('Content-Type', 'application/octet-stream');
    }
    
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }
}));

// API Routes with middleware configuration
app.use('/api/auth', authRoutes); 


app.use('/api/posts', postRoutes); 


app.use('/api/users', userRoutes); 

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.version,
    environment: process.env.NODE_ENV || 'development'
  });
});


app.get('/api/info', (req, res) => {
  res.json({
    name: 'Twitter Clone API',
    version: '1.0.0',
    description: 'A Twitter-like social media API',
    endpoints: {
      auth: {
        '/api/auth/register': 'POST - Register new user',
        '/api/auth/login': 'POST - Login user',
        '/api/auth/metamask': 'POST - MetaMask auth',
        '/api/auth/me': 'GET - Get current user (auth required)',
        '/api/auth/logout': 'POST - Logout user',
      },
      posts: {
        '/api/posts': 'GET - Get posts, POST - Create post (auth required)',
        '/api/posts/:id': 'GET - Get single post, DELETE - Delete post (auth required)',
        '/api/posts/:id/like': 'POST - Like/unlike post (auth required)',
        '/api/posts/:id/comment': 'POST - Add comment (auth required)',
        '/api/posts/:id/retweet': 'POST - Retweet post (auth required)',
        '/api/posts/search': 'GET - Search posts',
      },
      users: {
        '/api/users/profile/:username': 'GET - Get user profile',
        '/api/users/upload-avatar': 'POST - Upload avatar (auth required)',
        '/api/users/:id/follow': 'POST - Follow user, DELETE - Unfollow user (auth required)',
        '/api/users/search': 'GET - Search users',
      }
    }
  });
});


const createUploadDirs = async () => {
  const fs = require('fs').promises;
  const uploadDirs = [
    path.join(__dirname, 'uploads'),
    path.join(__dirname, 'uploads/avatars'),
    path.join(__dirname, 'uploads/covers'),
  ];

  for (const dir of uploadDirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
      console.log(`📁 Upload directory ensured: ${dir}`);
    } catch (error) {
      if (error.code !== 'EEXIST') {
        console.error(`❌ Failed to create directory ${dir}:`, error);
      }
    }
  }
};

// error handler of cors
app.use((err, req, res, next) => {
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS policy violation' });
  }
  next(err);
});

// eorros handle of globl
app.use((error, req, res, next) => {
  console.error('❌ Server Error:', error);
  
  
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large. Maximum size is 5MB.' });
  }
  if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'Unexpected file field.' });
  }
  
  
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ error: 'Invalid JSON format' });
  }
  
  
  if (error.message === 'Only image files are allowed!') {
    return res.status(400).json({ error: 'Only image files are allowed!' });
  }
  
  
  if (error.name === 'SequelizeConnectionError') {
    return res.status(503).json({ error: 'Database connection failed' });
  }
  
  
  const isDevelopment = process.env.NODE_ENV !== 'production';
  res.status(error.status || 500).json({
    error: error.message || 'Internal server error',
    ...(isDevelopment && { 
      stack: error.stack,
      details: error.toString()
    })
  });
});


app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method,
    suggestion: 'Check API documentation at /api/info'
  });
});

// Initialize database and start server
const startServer = async () => {
  try {
    console.log('🚀 Starting Twitter Clone Server...');
    
    
    await createUploadDirs();
    
    
    console.log('📊 Connecting to database...');
    await initDB();
    
    
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log('\n' + '='.repeat(50));
      console.log('🚀 Server running successfully!');
      console.log(`📡 Port: ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📱 Frontend URL: ${process.env.CLIENT_URL || 'http://localhost:3000'}`);
      console.log(`🖼️  Static files: ${path.join(__dirname, 'uploads')}`);
      console.log(`📚 API Documentation: http://localhost:${PORT}/api/info`);
      console.log(`🏥 Health Check: http://localhost:${PORT}/api/health`);
      console.log('='.repeat(50) + '\n');
    });

    
    const gracefulShutdown = (signal) => {
      console.log(`\n🔄 Received ${signal}, shutting down gracefully...`);
      server.close(() => {
        console.log('✅ Server closed successfully');
        process.exit(0);
      });
      
      
      setTimeout(() => {
        console.log('⏰ Forcing shutdown...');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
    return server;
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};


process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
  if (process.env.NODE_ENV === 'development') {
    console.error('Stack:', reason.stack);
  }
  
  if (process.env.NODE_ENV !== 'production') {
    setTimeout(() => process.exit(1), 1000);
  }
});


process.on('uncaughtException', (error) => {
  console.error('🚨 Uncaught Exception:', error);
  console.error('Stack:', error.stack);
  
  setTimeout(() => process.exit(1), 1000);
});


startServer().catch((error) => {
  console.error('❌ Server startup failed:', error);
  process.exit(1);
});

module.exports = app;