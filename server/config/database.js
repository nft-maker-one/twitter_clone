const { Sequelize, DataTypes } = require('sequelize');
require('dotenv').config();


const sequelize = new Sequelize(
  process.env.DB_NAME || 'twitter_clone',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD || 'password',
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: false,
    define: {
      underscored: true,
      freezeTableName: true,
    },
  }
);


async function initFullTextSearch() {
  await sequelize.query(`
    ALTER TABLE posts
      ADD COLUMN IF NOT EXISTS content_tsv tsvector;
  `);

  
  await sequelize.query(`DROP TRIGGER IF EXISTS posts_tsvector_update ON posts;`);
  await sequelize.query(`DROP TRIGGER IF EXISTS tsvectorupdate ON posts;`);
  await sequelize.query(`DROP FUNCTION IF EXISTS public.posts_tsv_trigger() CASCADE;`);

  
  await sequelize.query(`
    CREATE TRIGGER posts_tsvector_update
    BEFORE INSERT OR UPDATE ON posts
    FOR EACH ROW
    EXECUTE PROCEDURE pg_catalog.tsvector_update_trigger(
      'content_tsv',
      'pg_catalog.english',
      'content'
    );
  `);

  
  await sequelize.query(`
    UPDATE posts
    SET content_tsv = to_tsvector('pg_catalog.english', content);
  `);

  
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_posts_content_tsv
    ON posts USING gin(content_tsv);
  `);

  console.log('✅ Full-text search initialized');
}


const User = sequelize.define(
  'User',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    username: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    email: { type: DataTypes.STRING(100), unique: true,allowNull:true },
    password_hash: { type: DataTypes.STRING },
    wallet_address: { type: DataTypes.STRING(42), unique: true },
    bio: { type: DataTypes.TEXT, defaultValue: '' },
    avatar_url: { type: DataTypes.STRING, defaultValue: '' },
    cover_url: { type: DataTypes.STRING, defaultValue: '' },
    location: { type: DataTypes.STRING(100), defaultValue: '' },
    website: { type: DataTypes.STRING(200), defaultValue: '' },
  },
  {
    tableName: 'users',
    timestamps: true,
    underscored: true,
  }
);


const Post = sequelize.define(
  'Post',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    likes_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }, 
    retweets_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }, 
    comments_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    parent_id: { type: DataTypes.INTEGER }, 
    is_retweet: { type: DataTypes.BOOLEAN, defaultValue: false },
    original_post_id: { type: DataTypes.INTEGER }, 
  },
  {
    tableName: 'posts',
    timestamps: true,
    underscored: true,
  }
);




const Comment = sequelize.define(
  'Comment',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    post_id: { type: DataTypes.INTEGER, allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    parent_comment_id: { type: DataTypes.INTEGER }, 
  },
  {
    tableName: 'comments',
    timestamps: true,
    underscored: true,
  }
);


const Follow = sequelize.define(
  'Follow',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    follower_id: { type: DataTypes.INTEGER, allowNull: false },
    following_id: { type: DataTypes.INTEGER, allowNull: false },
  },
  {
    tableName: 'follows',
    timestamps: true,
    underscored: true,
    indexes: [
      { unique: true, fields: ['follower_id', 'following_id'] }
    ]
  }
);


const Like = sequelize.define(
  'Like',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    post_id: { type: DataTypes.INTEGER, allowNull: false },
  },
  {
    tableName: 'likes',
    timestamps: true,
    underscored: true,
    indexes: [
      { unique: true, fields: ['user_id', 'post_id'] }
    ]
  }
);



User.hasMany(Post, { foreignKey: 'user_id', onDelete: 'CASCADE' });
Post.belongsTo(User, { foreignKey: 'user_id', as: 'author' });


Post.hasMany(Comment, { foreignKey: 'post_id', onDelete: 'CASCADE', as: 'postComments' });
Comment.belongsTo(Post, { foreignKey: 'post_id' });
Comment.belongsTo(User, { foreignKey: 'user_id', as: 'author' });


Comment.hasMany(Comment, { foreignKey: 'parent_comment_id', as: 'replies' });
Comment.belongsTo(Comment, { foreignKey: 'parent_comment_id', as: 'parent' });


Post.belongsTo(Post, { foreignKey: 'original_post_id', as: 'originalPost' });
Post.hasMany(Post, { foreignKey: 'original_post_id', as: 'postRetweets' }); 


User.belongsToMany(User, {
  through: Follow,
  as: 'followers',
  foreignKey: 'following_id',
  otherKey: 'follower_id'
});

User.belongsToMany(User, {
  through: Follow,
  as: 'following',
  foreignKey: 'follower_id',
  otherKey: 'following_id'
});


User.belongsToMany(Post, {
  through: Like,
  as: 'likedPosts',
  foreignKey: 'user_id',
  otherKey: 'post_id'
});

Post.belongsToMany(User, {
  through: Like,
  as: 'likedByUsers',
  foreignKey: 'post_id',
  otherKey: 'user_id'
});


User.hasMany(Like, { foreignKey: 'user_id', onDelete: 'CASCADE' });
Post.hasMany(Like, { foreignKey: 'post_id', onDelete: 'CASCADE' });
Like.belongsTo(User, { foreignKey: 'user_id' });
Like.belongsTo(Post, { foreignKey: 'post_id' });


const initDB = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connection established successfully.');
    
    await sequelize.sync({ alter: true });
    console.log('✅ Database synchronized successfully');
    
    
    if (process.env.NODE_ENV !== 'production') {
      await createSampleData();
    }
    await initFullTextSearch()
  } catch (error) {
    console.error('❌ Error initializing database:', error);
  }
};


const createSampleData = async () => {
  try {
    const userCount = await User.count();
    if (userCount === 0) {
      console.log('Creating sample data...');
      
      
      const sampleUser = await User.create({
        username: 'demo_user',
        email: 'demo@example.com',
        bio: 'This is a demo user for testing',
        avatar_url: 'https://ui-avatars.com/api/?name=Demo+User&background=1DA1F2&color=fff'
      });
      
      
      await Post.create({
        user_id: sampleUser.id,
        content: 'Welcome to SocialApp! This is your first post. 🎉',
        likes_count: 0,
        retweets_count: 0,
        comments_count: 0
      });
      
      console.log('✅ Sample data created');
    }
  } catch (error) {
    console.error('Error creating sample data:', error);
  }
};

module.exports = { 
  sequelize, 
  User, 
  Post, 
  Comment, 
  Follow, 
  Like,  
  initDB
};