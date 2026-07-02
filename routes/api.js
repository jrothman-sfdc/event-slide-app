const express = require('express');
const { customAlphabet } = require('nanoid');
const { pool } = require('../db');
const { fetchPresentationData, fetchSlideThumbnails } = require('../services/slides');

const router = express.Router();
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8);

function extractPresentationId(input) {
  const urlMatch = input.match(/\/presentation\/d\/([a-zA-Z0-9_-]+)/);
  if (urlMatch) return urlMatch[1];
  if (/^[a-zA-Z0-9_-]{25,}$/.test(input.trim())) return input.trim();
  return null;
}

router.get('/shows', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, slug, title, default_duration, created_at FROM shows ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/shows', async (req, res) => {
  const { url, defaultDuration } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });

  const presentationId = extractPresentationId(url);
  if (!presentationId) return res.status(400).json({ error: 'Invalid Google Slides URL or ID' });

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GOOGLE_API_KEY is not configured on the server' });

  try {
    const { title, slides } = await fetchPresentationData(presentationId, apiKey);
    const slug = nanoid();
    const duration = Math.max(1000, parseInt(defaultDuration) || 5000);

    const result = await pool.query(
      `INSERT INTO shows (slug, presentation_id, title, slides, default_duration)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, slug, title, default_duration, created_at`,
      [slug, presentationId, title, JSON.stringify(slides), duration]
    );

    res.json({ ...result.rows[0], slideCount: slides.length });
  } catch (err) {
    console.error('Error creating show:', err);
    const msg = err.message.includes('API key') || err.message.includes('403')
      ? 'Google API access denied. Check your API key and that the presentation is publicly shared.'
      : err.message;
    res.status(500).json({ error: msg });
  }
});

router.get('/shows/:slug', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM shows WHERE slug = $1', [req.params.slug]);
    if (!result.rows.length) return res.status(404).json({ error: 'Show not found' });

    const show = result.rows[0];
    const apiKey = process.env.GOOGLE_API_KEY;

    const pageIds = show.slides.map(s => s.pageId);
    const thumbnails = await fetchSlideThumbnails(show.presentation_id, pageIds, apiKey);

    const slidesWithImages = show.slides.map(s => ({
      ...s,
      imageUrl: thumbnails[s.pageId] || null
    }));

    res.json({ ...show, slides: slidesWithImages });
  } catch (err) {
    console.error('Error fetching show:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/shows/:slug/refresh', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM shows WHERE slug = $1', [req.params.slug]);
    if (!result.rows.length) return res.status(404).json({ error: 'Show not found' });

    const show = result.rows[0];
    const apiKey = process.env.GOOGLE_API_KEY;

    const { title, slides } = await fetchPresentationData(show.presentation_id, apiKey);

    await pool.query(
      'UPDATE shows SET title = $1, slides = $2 WHERE slug = $3',
      [title, JSON.stringify(slides), req.params.slug]
    );

    res.json({ success: true, title, slideCount: slides.length });
  } catch (err) {
    console.error('Error refreshing show:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/shows/:slug', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM shows WHERE slug = $1 RETURNING id', [req.params.slug]);
    if (!result.rows.length) return res.status(404).json({ error: 'Show not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
