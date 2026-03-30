import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

import { initDB } from './db.js';
import createWebhookRouter from './routes/webhook.js';
import productsRouter from './routes/products.js';
import suppliersRouter from './routes/suppliers.js';
import exportRouter from './routes/export.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

// Initialize database before starting server
await initDB();

const app = express();

// CORS for dev mode
app.use(cors());

// LINE Webhook needs raw body for signature verification — must come before json parser
const lineConfig = {
  channelSecret: process.env.LINE_CHANNEL_SECRET || '',
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || ''
};
app.use('/webhook', createWebhookRouter(lineConfig));

// JSON parser for API routes
app.use(express.json());

// API routes
app.use('/api/products', productsRouter);
app.use('/api/suppliers', suppliersRouter);
app.use('/api/export', exportRouter);

// Serve frontend
const publicDir = join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.get('*', (req, res) => {
  res.sendFile(join(publicDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Webhook URL: POST /webhook`);
  console.log(`API: GET /api/products, GET /api/suppliers`);
});
