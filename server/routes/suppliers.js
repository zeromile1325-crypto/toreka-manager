import { Router } from 'express';
import { getAllSuppliers, updateSupplierAliases } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(getAllSuppliers());
});

router.put('/:id/aliases', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { aliases } = req.body;

  if (!Array.isArray(aliases)) {
    return res.status(400).json({ error: 'aliases must be an array' });
  }

  updateSupplierAliases(id, aliases);
  res.json({ ok: true });
});

export default router;
