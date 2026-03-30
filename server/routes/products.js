import { Router } from 'express';
import { getActiveProducts, deleteProductById, deactivateBySupplierId, findOrCreateSupplier, insertProducts } from '../db.js';
import { parseMessage } from '../parser.js';

const router = Router();

router.get('/', (req, res) => {
  const { search, supplier_id, sort_by, sort_order, limit, offset } = req.query;

  const result = getActiveProducts({
    search: search || '',
    supplierId: supplier_id ? parseInt(supplier_id, 10) : null,
    sortBy: sort_by || 'posted_at',
    sortOrder: sort_order || 'desc',
    limit: Math.min(parseInt(limit, 10) || 100, 500),
    offset: parseInt(offset, 10) || 0
  });

  res.json(result);
});

// 商品1件を削除（非表示）
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const result = deleteProductById(id);
  res.json({ ok: true, changes: result.changes });
});

// 仕入先の全商品を削除（非表示）
router.delete('/supplier/:supplierId', (req, res) => {
  const supplierId = parseInt(req.params.supplierId, 10);
  const result = deactivateBySupplierId(supplierId);
  res.json({ ok: true, changes: result.changes });
});

// Web画面からの手動テキスト入力
router.post('/parse', (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });

  const { supplierName, items } = parseMessage(text);
  if (!items.length) {
    return res.status(400).json({ error: '商品情報を検出できませんでした' });
  }

  const name = supplierName || '不明な仕入先';
  const supplier = findOrCreateSupplier(name);

  // 同じ仕入先の古いデータを自動入替
  const deactivated = deactivateBySupplierId(supplier.id);

  const messageId = `web_${Date.now()}`;
  insertProducts(messageId, supplier.id, items, new Date().toISOString());

  res.json({
    ok: true,
    supplier: supplier.name,
    itemCount: items.length,
    replaced: deactivated.changes
  });
});

export default router;
