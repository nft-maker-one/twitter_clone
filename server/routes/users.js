
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const { optionalAuth } = require('../middleware/auth');
const router = express.Router();


const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/avatars');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    
    const ext = path.extname(file.originalname);
    const filename = `${req.user.id}_${Date.now()}${ext}`;
    cb(null, filename);
  }
});


const fileFilter = (req, file, cb) => {
  
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, 
  }
});


router.get('/profile/:username', optionalAuth, async (req, res) => {
  try {
    const { username } = req.params;
    const user = await User.findByUsername(username);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = await User.findById(user.id, true);
    
    
    if (req.user && req.user.id !== user.id) {
      userData.is_following = await User.isFollowing(req.user.id, user.id);
    }

    res.json({ user: userData });
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.get('/:userId', optionalAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const userData = await User.findById(parseInt(userId), true);
    
    if (!userData) {
      return res.status(404).json({ error: 'User not found' });
    }

    
    if (req.user && req.user.id !== parseInt(userId)) {
      userData.is_following = await User.isFollowing(req.user.id, parseInt(userId));
    }

    res.json({ user: userData });
  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const updates = req.body;
    const user = await User.updateProfile(req.user.id, updates);
    res.json({ user });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.post('/upload-avatar', authMiddleware, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    
    const avatarUrl = `${req.protocol}://${req.get('host')}/uploads/avatars/${req.file.filename}`;
    
    
    const currentUser = await User.findById(req.user.id);
    if (currentUser.avatar_url && currentUser.avatar_url.includes('/uploads/avatars/')) {
      try {
        const oldFilename = path.basename(currentUser.avatar_url);
        const oldFilePath = path.join(__dirname, '../uploads/avatars', oldFilename);
        await fs.unlink(oldFilePath);
      } catch (unlinkError) {
        console.log('Could not delete old avatar:', unlinkError.message);
      }
    }

    
    const updatedUser = await User.updateProfile(req.user.id, { avatar_url: avatarUrl });
    
    res.json({ 
      user: updatedUser,
      avatar_url: avatarUrl,
      message: 'Avatar uploaded successfully' 
    });
  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
});


router.post('/:userId/follow', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const followingId = parseInt(userId);
    
    if (followingId === req.user.id) {
      return res.status(400).json({ error: 'Cannot follow yourself' });
    }

    const result = await User.follow(req.user.id, followingId);
    res.json(result);
  } catch (error) {
    console.error('Follow error:', error);
    res.status(400).json({ error: error.message });
  }
});


router.delete('/:userId/follow', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const followingId = parseInt(userId);

    const result = await User.unfollow(req.user.id, followingId);
    res.json(result);
  } catch (error) {
    console.error('Unfollow error:', error);
    res.status(400).json({ error: error.message });
  }
});


router.get('/:userId/following', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const followingId = parseInt(userId);
    
    const isFollowing = await User.isFollowing(req.user.id, followingId);
    res.json({ isFollowing });
  } catch (error) {
    console.error('Check following error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.get('/:userId/followers', async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const followers = await User.getFollowers(parseInt(userId), limit, offset);
    res.json({ followers, page, limit });
  } catch (error) {
    console.error('Get followers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.get('/:userId/following-list', async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const following = await User.getFollowing(parseInt(userId), limit, offset);
    res.json({ following, page, limit });
  } catch (error) {
    console.error('Get following error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.get('/search', async (req, res) => {
  try {
    const { q, page = 1, limit = 20 } = req.query;
    
    if (!q || q.trim() === '') {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const users = await User.search(q.trim(), parseInt(limit), offset);
    
    res.json({ users, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.get('/recommendations', optionalAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    
    
    const { User: UserModel } = require('../config/database');
    const users = await UserModel.findAll({
      where: req.user ? { id: { [require('sequelize').Op.ne]: req.user.id } } : {},
      attributes: ['id', 'username', 'avatar_url', 'bio', 'created_at'],
      order: [['created_at', 'DESC']],
      limit
    });

    const recommendations = users.map(user => User.toJSON(user));
    res.json({ recommendations });
  } catch (error) {
    console.error('Get recommendations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;