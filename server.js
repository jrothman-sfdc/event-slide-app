require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./db');
const apiRouter = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', apiRouter);

app.get('/show/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function start() {
  await initDb();
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
