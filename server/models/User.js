
const bcrypt = require('bcryptjs');
const { User, Follow } = require('../config/database');

class UserModel {
  
  static async create({ username, email, password, wallet_address }) {
    const password_hash = password ? await bcrypt.hash(password, 10) : null;
    const user = await User.create({
      username,
      email,
      password_hash,
      wallet_address,
      avatar_url: `https://ui-avatars.com/api/?name=${username}&background=random`,
      bio: `Hey there! I'm ${username}`,
    });
    return this.toJSON(user);
  }

  
  static async findByUsername(username) {
    const user = await User.findOne({ where: { username } });
    return user ? this.toJSON(user) : null;
  }

  
  static async findById(id, includeStats = false) {
    const user = await User.findByPk(id);
    if (!user) return null;
    
    const userData = this.toJSON(user);
    
    if (includeStats) {
      
      const followersCount = await Follow.count({ where: { following_id: id } });
      const followingCount = await Follow.count({ where: { follower_id: id } });
      
      userData.followers_count = followersCount;
      userData.following_count = followingCount;
    }
    
    return userData;
  }

  
  static async findByWallet(wallet_address) {
    const user = await User.findOne({ where: { wallet_address } });
    return user ? this.toJSON(user) : null;
  }

  
  static async validatePassword(password, hash) {
    return bcrypt.compare(password, hash);
  }

  
  static async updateProfile(userId, updates) {
    const allowedFields = ['bio', 'avatar_url', 'cover_url', 'location', 'website'];
    const filteredUpdates = {};
    
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        filteredUpdates[field] = updates[field];
      }
    }
    
    await User.update(filteredUpdates, { where: { id: userId } });
    return this.findById(userId, true);
  }

  
  static async follow(followerId, followingId) {
    if (followerId === followingId) {
      throw new Error('Cannot follow yourself');
    }
    
    const [follow, created] = await Follow.findOrCreate({
      where: { follower_id: followerId, following_id: followingId },
      defaults: { follower_id: followerId, following_id: followingId }
    });
    
    if (!created) {
      throw new Error('Already following this user');
    }
    
    return { success: true, message: 'Successfully followed user' };
  }

  
  static async unfollow(followerId, followingId) {
    const result = await Follow.destroy({
      where: { follower_id: followerId, following_id: followingId }
    });
    
    if (result === 0) {
      throw new Error('Not following this user');
    }
    
    return { success: true, message: 'Successfully unfollowed user' };
  }

  
  static async isFollowing(followerId, followingId) {
    const follow = await Follow.findOne({
      where: { follower_id: followerId, following_id: followingId }
    });
    return !!follow;
  }

  
  static async getFollowers(userId, limit = 20, offset = 0) {
    const user = await User.findByPk(userId, {
      include: [{
        model: User,
        as: 'followers',
        attributes: ['id', 'username', 'avatar_url', 'bio'],
        through: { attributes: [] },
        limit,
        offset
      }]
    });
    
    return user ? user.followers.map(f => this.toJSON(f)) : [];
  }

  
  static async getFollowing(userId, limit = 20, offset = 0) {
    const user = await User.findByPk(userId, {
      include: [{
        model: User,
        as: 'following',
        attributes: ['id', 'username', 'avatar_url', 'bio'],
        through: { attributes: [] },
        limit,
        offset
      }]
    });
    
    return user ? user.following.map(f => this.toJSON(f)) : [];
  }

  
  static async search(query, limit = 20, offset = 0) {
    const { Op } = require('sequelize');
    const users = await User.findAll({
      where: {
        username: { [Op.iLike]: `%${query}%` }
      },
      attributes: ['id', 'username', 'avatar_url', 'bio'],
      limit,
      offset
    });
    
    return users.map(u => this.toJSON(u));
  }

  
  static toJSON(user) {
    if (!user) return null;
    const userObj = user.toJSON ? user.toJSON() : user;
    delete userObj.password_hash;
    return userObj;
  }
}

module.exports = UserModel;