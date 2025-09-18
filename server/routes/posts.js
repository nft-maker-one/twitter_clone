const express = require('express');
const Post = require('../models/Post');
const authMiddleware = require('../middleware/auth');
const { optionalAuth } = require('../middleware/auth');
const router = express.Router();


router.get('/', optionalAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const timeline = req.query.timeline === 'true';
    const userId = req.query.userId;

    let posts;
    
    if (timeline && req.user) {
      
      posts = await Post.getTimeline(req.user.id, limit, offset);
    } else if (userId) {
      
      posts = await Post.getAll(limit, offset, parseInt(userId));
    } else {
      
      posts = await Post.getAll(limit, offset);
    }

    
    const postsWithLikes = await Post.getPostsWithLikeInfo(posts, req.user?.id);

    res.json({ posts: postsWithLikes, page, limit });
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.post('/', authMiddleware, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || content.trim() === '') {
      return res.status(400).json({ error: 'Post content is required' });
    }
    if (content.length > 280) {
      return res.status(400).json({ error: 'Post content must be 280 characters or less' });
    }

    const post = await Post.create(req.user.id, content.trim());
    
    
    const postWithLikes = await Post.getPostsWithLikeInfo([post], req.user.id);

    res.status(201).json({ post: postWithLikes[0] });
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.post('/:postId/retweet', authMiddleware, async (req, res) => {
  try {
    const { postId } = req.params;
    const { content } = req.body;

    const retweet = await Post.retweet(req.user.id, parseInt(postId), content);
    
    
    const retweetWithLikes = await Post.getPostsWithLikeInfo([retweet], req.user.id);
    
    res.status(201).json({ post: retweetWithLikes[0] });
  } catch (error) {
    console.error('Retweet error:', error);
    res.status(400).json({ error: error.message || 'Failed to retweet' });
  }
});


router.post('/:postId/comment', authMiddleware, async (req, res) => {
  try {
    const { postId } = req.params;
    const { content } = req.body;

    if (!content || content.trim() === '') {
      return res.status(400).json({ error: 'Comment content is required' });
    }

    const comment = await Post.addComment(req.user.id, parseInt(postId), content.trim());
    res.status(201).json({ comment });
  } catch (error) {
    console.error('Comment error:', error);
    res.status(400).json({ error: error.message || 'Failed to add comment' });
  }
});


router.get('/:postId/comments', async (req, res) => {
  try {
    const { postId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const comments = await Post.getComments(parseInt(postId), limit, offset);
    res.json({ comments, page, limit });
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.post('/:postId/like', authMiddleware, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;
    
    const result = await Post.like(parseInt(postId), userId);
    
    res.json({
      message: result.liked ? 'Post liked' : 'Post unliked',
      like_count: result.like_count,
      liked: result.liked
    });
  } catch (error) {
    console.error('Like post error:', error);
    res.status(400).json({ error: error.message || 'Internal server error' });
  }
});


router.delete('/:postId', authMiddleware, async (req, res) => {
  try {
    const { postId } = req.params;
    const deleted = await Post.delete(parseInt(postId), req.user.id);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Post not found or unauthorized' });
    }

    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.get('/search', optionalAuth, async (req, res) => {
  try {
    const { q } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    if (!q || q.trim() === '') {
      return res.status(400).json({ error: 'Search query required' });
    }

    const posts = await Post.search(q.trim(), limit, offset);
    
    
    const postsWithLikes = await Post.getPostsWithLikeInfo(posts, req.user?.id);
    console.log(postsWithLikes)
    res.json({ posts: postsWithLikes, page, limit });
  } catch (error) {
    console.error('Search posts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.get('/:postId', optionalAuth, async (req, res) => {
  try {
    const { postId } = req.params;
    const post = await Post.findById(parseInt(postId));
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    
    const postWithLikes = await Post.getPostsWithLikeInfo([post], req.user?.id);
    
    res.json({ post: postWithLikes[0] });
  } catch (error) {
    console.error('Get post error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;