import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { initDB } from './db.js';
import createWebhookRouter from './routes/webhook.js';
import productsRouter from './routes/products.js';
import suppliersRouter from './routes/suppliers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

await initDB();

const app = express();
app.use(cors());

const lineConfig = {
    channelSecret: process.env.LINE_CHANNEL_SECRET || '',
    channelAccessToken: process.env.LINE_CHANNEL_TOKEN || ''
};
app.use('/webhook', createWebhookRouter(lineConfig));

app.use(express.json());
app.use('/api/products', productsRouter);
app.use('/api/suppliers', suppliersRouter);

const publicDir = join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.get('*', (req, res) => {
    res.sendFile(join(publicDir, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
