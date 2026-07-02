require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shows (
      id SERIAL PRIMARY KEY,
      slug VARCHAR(50) UNIQUE NOT NULL,
      presentation_id VARCHAR(200) NOT NULL,
      title VARCHAR(500) NOT NULL DEFAULT 'Untitled',
      slides JSONB NOT NULL DEFAULT '[]',
      default_duration INTEGER NOT NULL DEFAULT 5000,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('Database initialized');
}

module.exports = { pool, initDb };
