const express = require('express');
const { createOAuth2Client, getAuthUrl, storeTokens, getAuthStatus, disconnect } = require('../services/auth');

const router = express.Router();

// Redirect to Google's OAuth consent screen
router.get('/google', (req, res) => {
  res.redirect(getAuthUrl());
});

// Google redirects here after user consents
router.get('/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.redirect('/?auth=denied');
  }
  if (!code) {
    return res.status(400).send('Missing authorization code.');
  }

  try {
    const client = createOAuth2Client();
    const { tokens } = await client.getToken(code);

    if (!tokens.refresh_token) {
      // This happens if the user has already granted access before and prompt=consent was bypassed.
      // Shouldn't occur with prompt=consent in the auth URL, but handle it gracefully.
      return res.redirect('/?auth=no_refresh_token');
    }

    await storeTokens(tokens, client);
    res.redirect('/?auth=success');
  } catch (e) {
    console.error('OAuth callback error:', e.message);
    res.redirect('/?auth=error');
  }
});

// Current auth status
router.get('/status', async (req, res) => {
  try {
    res.json(await getAuthStatus());
  } catch (e) {
    res.json({ authenticated: false, email: null });
  }
});

// Remove stored credentials
router.post('/disconnect', async (req, res) => {
  try {
    await disconnect();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
