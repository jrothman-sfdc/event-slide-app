const { google } = require('googleapis');
const { pool } = require('../db');

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

function getAuthUrl() {
  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',   // forces a refresh token to be issued every time
    scope: [
      'https://www.googleapis.com/auth/presentations.readonly',
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/userinfo.email'
    ]
  });
}

async function storeTokens(tokens, oauth2Client) {
  await pool.query(
    `INSERT INTO config (key, value) VALUES ('refresh_token', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1`,
    [tokens.refresh_token]
  );
  // Store email for display in admin UI
  try {
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const info = await oauth2.userinfo.get();
    await pool.query(
      `INSERT INTO config (key, value) VALUES ('user_email', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [info.data.email]
    );
  } catch (e) {
    console.warn('Could not fetch user email:', e.message);
  }
}

async function getAuthClient() {
  const result = await pool.query('SELECT value FROM config WHERE key = $1', ['refresh_token']);
  if (!result.rows.length) {
    throw new Error('NOT_AUTHENTICATED');
  }
  const client = createOAuth2Client();
  client.setCredentials({ refresh_token: result.rows[0].value });
  return client;
}

async function getAuthStatus() {
  const result = await pool.query(
    "SELECT key, value FROM config WHERE key IN ('refresh_token', 'user_email')"
  );
  const map = Object.fromEntries(result.rows.map(r => [r.key, r.value]));
  return {
    authenticated: !!map.refresh_token,
    email: map.user_email || null
  };
}

async function disconnect() {
  await pool.query("DELETE FROM config WHERE key IN ('refresh_token', 'user_email')");
}

module.exports = { createOAuth2Client, getAuthUrl, storeTokens, getAuthClient, getAuthStatus, disconnect };
