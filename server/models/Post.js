const { Post, User, Comment, Like,sequelize } = require('../config/database');
const { Op,Sequelize } = require('sequelize');

class PostModel {
  // create post
  static async create(userId, content) {
    const post = await Post.create({
      user_id: userId,
      content,
      likes_count: 0,
      retweets_count: 0,
      comments_count: 0
    });

    return this.findById(post.id);
  }


  static async retweet(userId, originalPostId, content = '') {
    // exist check
    const originalPost = await Post.findByPk(originalPostId);
    if (!originalPost) {
      throw new Error('Original post not found');
    }

    
    const retweet = await Post.create({
      user_id: userId,
      content: content || '',
      is_retweet: true,
      original_post_id: originalPostId,
      likes_count: 0,
      retweets_count: 0,
      comments_count: 0
    });

    
    await originalPost.increment('retweets_count');

    return this.findById(retweet.id);
  }

  
  static async addComment(userId, postId, content) {
    const post = await Post.findByPk(postId);
    if (!post) {
      throw new Error('Post not found');
    }

    const comment = await Comment.create({
      user_id: userId,
      post_id: postId,
      content
    });

    
    await post.increment('comments_count');

    
    const commentWithUser = await Comment.findByPk(comment.id, {
      include: [{
        model: User,
        as: 'author',
        attributes: ['id', 'username', 'avatar_url']
      }]
    });

    return commentWithUser.toJSON();
  }

  
  static async getComments(postId, limit = 20, offset = 0) {
    const comments = await Comment.findAll({
      where: { post_id: postId, parent_comment_id: null },
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'username', 'avatar_url']
        },
        {
          model: Comment,
          as: 'replies',
          include: [{
            model: User,
            as: 'author',
            attributes: ['id', 'username', 'avatar_url']
          }]
        }
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    return comments.map(c => c.toJSON());
  }

  
  static async findById(postId) {
    const post = await Post.findByPk(postId, {
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'username', 'email', 'wallet_address', 'avatar_url', 'bio']
        },
        {
          model: Post,
          as: 'originalPost',
          include: [{
            model: User,
            as: 'author',
            attributes: ['id', 'username', 'avatar_url']
          }]
        }
      ]
    });

    return post ? post.toJSON() : null;
  }

  
  static async getAll(limit = 20, offset = 0, userId = null) {
    const whereClause = {};
    
    
    if (userId) {
      whereClause.user_id = userId;
    }

    const posts = await Post.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'username', 'email', 'wallet_address', 'avatar_url', 'bio']
        },
        {
          model: Post,
          as: 'originalPost',
          include: [{
            model: User,
            as: 'author',
            attributes: ['id', 'username', 'avatar_url']
          }]
        }
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    return posts.map(post => {
      const postData = post.toJSON();
      
      postData.username = postData.author.username;
      postData.wallet_address = postData.author.wallet_address;
      postData.user_id = postData.author.id;
      postData.likes = postData.likes_count; 
      postData.retweets = postData.retweets_count; 
      return postData;
    });
  }

  
  static async getTimeline(userId, limit = 20, offset = 0) {
    const { Follow } = require('../config/database');
    
    
    const following = await Follow.findAll({
      where: { follower_id: userId },
      attributes: ['following_id']
    });
    
    const followingIds = following.map(f => f.following_id);
    followingIds.push(userId); 

    const posts = await Post.findAll({
      where: {
        user_id: { [Op.in]: followingIds }
      },
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'username', 'email', 'wallet_address', 'avatar_url', 'bio']
        },
        {
          model: Post,
          as: 'originalPost',
          include: [{
            model: User,
            as: 'author',
            attributes: ['id', 'username', 'avatar_url']
          }]
        }
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    return posts.map(post => {
      const postData = post.toJSON();
      postData.username = postData.author.username;
      postData.wallet_address = postData.author.wallet_address;
      postData.user_id = postData.author.id;
      postData.likes = postData.likes_count;
      postData.retweets = postData.retweets_count;
      return postData;
    });
  }

  
  static async search(query, limit = 20, offset = 0) {
    
    const sanitizedQuery = query
      .trim()
      .replace(/['":&|!()]/g, ' ') 
      .replace(/\s+/g, ' & ');     

    const posts = await Post.findAll({
      where: sequelize.where(
        Sequelize.literal(`"content_tsv"`),
        '@@',
        Sequelize.fn('to_tsquery', 'pg_catalog.english', `${sanitizedQuery}:*`)
      ),
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'username', 'email', 'wallet_address', 'avatar_url'],
        },
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });

    return posts;
  }

  
  static async like(postId, userId) {
    const post = await Post.findByPk(postId);
    if (!post) {
      throw new Error('Post not found');
    }

    
    const existingLike = await Like.findOne({
      where: { user_id: userId, post_id: postId }
    });

    if (existingLike) {
      
      await existingLike.destroy();
      await post.decrement('likes_count');
      return { liked: false, like_count: post.likes_count - 1 };
    } else {
      
      await Like.create({ user_id: userId, post_id: postId });
      await post.increment('likes_count');
      return { liked: true, like_count: post.likes_count + 1 };
    }
  }

  
  static async isLikedBy(postId, userId) {
    const like = await Like.findOne({
      where: { user_id: userId, post_id: postId }
    });
    return !!like;
  }

  
  static async getLikeInfo(postId, userId = null) {
    const post = await Post.findByPk(postId);
    if (!post) {
      throw new Error('Post not found');
    }

    const likeCount = post.likes_count;
    let userLiked = false;

    if (userId) {
      userLiked = await this.isLikedBy(postId, userId);
    }

    return { like_count: likeCount, user_liked: userLiked };
  }

  
  static async delete(postId, userId) {
    const result = await Post.destroy({
      where: { id: postId, user_id: userId }
    });
    
    return result > 0;
  }

  
  static async getPostsWithLikeInfo(posts, userId = null) {
    if (!Array.isArray(posts)) return posts;
    
    return Promise.all(posts.map(async (post) => {
      const plainPost = typeof post.toJSON === 'function' ? post.toJSON() : post; 
      const likeInfo = await this.getLikeInfo(plainPost.id, userId);
      return {
        ...plainPost,
        like_count: likeInfo.like_count,
        user_liked: likeInfo.user_liked,
        likes: likeInfo.like_count 
      };
    }));
  }
}

module.exports = PostModel;