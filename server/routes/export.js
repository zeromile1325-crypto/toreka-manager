import { Router } from 'express';
import { google } from 'googleapis';
import { getAllActiveProductsForExport } from '../db.js';
import { getExchangeRates, convertPrice } from '../exchange.js';

const router = Router();

// GET /api/export/rates - Current exchange rates
router.get('/rates', async (req, res) => {
  const rates = await getExchangeRates();
  res.json(rates);
});

// POST /api/export/sheets - Export to Google Sheets
router.post('/sheets', async (req, res) => {
  try {
    const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!keyJson) {
      return res.status(400).json({ error: 'GOOGLE_SERVICE_ACCOUNT_KEY not configured' });
    }

    const key = JSON.parse(
      keyJson.startsWith('{') ? keyJson : Buffer.from(keyJson, 'base64').toString()
    );

    const auth = new google.auth.GoogleAuth({
      credentials: key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const products = getAllActiveProductsForExport();
    const rates = await getExchangeRates();
    const currencies = Object.keys(rates).filter(k => !k.startsWith('_'));

    // Group by category
    const groups = { pokemon: [], onepiece: [], others: [] };
    for (const p of products) {
      const cat = p.category || 'others';
      (groups[cat] || groups.others).push(p);
    }

    let spreadsheetId = process.env.GOOGLE_SHEET_ID;

    if (!spreadsheetId) {
      // Create new spreadsheet
      const create = await sheets.spreadsheets.create({
        requestBody: {
          properties: { title: 'Trading Card Price List' },
          sheets: [
            { properties: { title: 'Pokemon' } },
            { properties: { title: 'One Piece' } },
            { properties: { title: 'Others' } },
          ]
        }
      });
      spreadsheetId = create.data.spreadsheetId;
      console.log('Created spreadsheet:', spreadsheetId);
    }

    // Get existing sheets
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const existingSheets = meta.data.sheets.map(s => s.properties.title);

    const sheetMap = [
      { title: 'Pokemon', data: groups.pokemon },
      { title: 'One Piece', data: groups.onepiece },
      { title: 'Others', data: groups.others },
    ];

    // Header row
    const header = [
      'Product Name (EN)', 'Product Name (JP)', 'Supplier',
      'Cost (JPY)', 'Selling Price (JPY)',
      ...currencies.map(c => `Price (${c})`),
      'Quantity', 'Updated'
    ];

    for (const sheet of sheetMap) {
      // Create sheet if not exists
      if (!existingSheets.includes(sheet.title)) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [{ addSheet: { properties: { title: sheet.title } } }]
          }
        });
      }

      // Build data rows
      const rows = [header];
      for (const p of sheet.data) {
        const sellPrice = p.selling_price || p.price;
        const converted = convertPrice(sellPrice, rates);
        rows.push([
          p.english_name || p.product_name,
          p.product_name,
          p.supplier_name,
          p.price,
          p.selling_price || '',
          ...currencies.map(c => converted[c] || ''),
          p.quantity || '',
          p.posted_at ? new Date(p.posted_at).toLocaleDateString('ja-JP') : '',
        ]);
      }

      // Clear and write
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `'${sheet.title}'!A:Z`,
      });

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${sheet.title}'!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: rows },
      });
    }

    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
    res.json({ ok: true, url, spreadsheetId, ratesUpdatedAt: rates._updatedAt });

  } catch (err) {
    console.error('Sheets export failed:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
