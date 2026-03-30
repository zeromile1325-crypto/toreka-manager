import initSqlJs from 'sql.js';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const DB_PATH = join(DATA_DIR, 'prices.db');

mkdirSync(DATA_DIR, { recursive: true });

let db;

export async function initDB() {
  const SQL = await initSqlJs();

  if (existsSync(DB_PATH)) {
    const buffer = readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      aliases TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      line_message_id TEXT NOT NULL,
      supplier_id INTEGER REFERENCES suppliers(id),
      product_name TEXT NOT NULL,
      price INTEGER NOT NULL,
      quantity INTEGER,
      posted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_active BOOLEAN DEFAULT 1
    )
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active, supplier_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_products_message ON products(line_message_id)');

  // Migration: add new columns for export feature
  try { db.run('ALTER TABLE products ADD COLUMN english_name TEXT DEFAULT NULL'); } catch(e) {}
  try { db.run("ALTER TABLE products ADD COLUMN category TEXT DEFAULT 'others'"); } catch(e) {}
  try { db.run('ALTER TABLE products ADD COLUMN selling_price INTEGER DEFAULT NULL'); } catch(e) {}

  saveDB();
  return db;
}

function saveDB() {
  const data = db.export();
  writeFileSync(DB_PATH, Buffer.from(data));
}

// Helper to run SELECT and return array of objects
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows[0] || null;
}

// --- Supplier operations ---

export function findOrCreateSupplier(name) {
  // Check exact name match
  let supplier = queryOne('SELECT * FROM suppliers WHERE name = ?', [name]);
  if (supplier) return supplier;

  // Check aliases
  const all = queryAll('SELECT * FROM suppliers ORDER BY name');
  for (const s of all) {
    const aliases = JSON.parse(s.aliases || '[]');
    if (aliases.some(a => a === name)) {
      return s;
    }
  }

  // Create new supplier
  db.run('INSERT INTO suppliers (name, aliases) VALUES (?, ?)', [name, JSON.stringify([name])]);
  const row = queryOne('SELECT * FROM suppliers WHERE name = ?', [name]);
  saveDB();
  return row;
}

export function getAllSuppliers() {
  return queryAll('SELECT * FROM suppliers ORDER BY name').map(s => ({
    ...s,
    aliases: JSON.parse(s.aliases || '[]')
  }));
}

export function updateSupplierAliases(id, aliases) {
  db.run('UPDATE suppliers SET aliases = ? WHERE id = ?', [JSON.stringify(aliases), id]);
  saveDB();
}

// --- Product operations ---

export function insertProducts(messageId, supplierId, items, postedAt) {
  for (const item of items) {
    db.run(
      'INSERT INTO products (line_message_id, supplier_id, product_name, price, quantity, posted_at) VALUES (?, ?, ?, ?, ?, ?)',
      [messageId, supplierId, item.productName, item.price, item.quantity || null, postedAt || new Date().toISOString()]
    );
  }
  saveDB();
}

export function deactivateByMessageId(messageId) {
  db.run('UPDATE products SET is_active = 0 WHERE line_message_id = ?', [messageId]);
  const changes = db.getRowsModified();
  saveDB();
  return { changes };
}

export function deactivateBySupplierId(supplierId) {
  db.run('UPDATE products SET is_active = 0 WHERE supplier_id = ? AND is_active = 1', [supplierId]);
  const changes = db.getRowsModified();
  saveDB();
  return { changes };
}

export function deleteProductById(productId) {
  db.run('UPDATE products SET is_active = 0 WHERE id = ?', [productId]);
  const changes = db.getRowsModified();
  saveDB();
  return { changes };
}

// --- Export feature operations ---

export function updateProductEnglishName(id, englishName) {
  db.run('UPDATE products SET english_name = ? WHERE id = ?', [englishName, id]);
  saveDB();
}

export function updateProductCategory(id, category) {
  db.run('UPDATE products SET category = ? WHERE id = ?', [category, id]);
  saveDB();
}

export function updateProductSellingPrice(id, sellingPrice) {
  db.run('UPDATE products SET selling_price = ? WHERE id = ?', [sellingPrice, id]);
  saveDB();
}

export function getAllActiveProductsForExport() {
  return queryAll(
    `SELECT p.*, s.name as supplier_name FROM products p JOIN suppliers s ON p.supplier_id = s.id WHERE p.is_active = 1 ORDER BY p.category, p.product_name`
  );
}

export function getActiveProducts({ search, supplierId, sortBy, sortOrder, limit, offset }) {
  let whereClauses = ['p.is_active = 1'];
  const params = [];

  if (search) {
    whereClauses.push('p.product_name LIKE ?');
    params.push(`%${search}%`);
  }
  if (supplierId) {
    whereClauses.push('p.supplier_id = ?');
    params.push(supplierId);
  }

  const where = whereClauses.join(' AND ');

  const validSorts = ['price', 'posted_at', 'product_name', 'supplier_name'];
  const sort = validSorts.includes(sortBy) ? sortBy : 'posted_at';
  const order = sortOrder === 'asc' ? 'ASC' : 'DESC';
  const orderCol = sort === 'supplier_name' ? 's.name' : `p.${sort}`;

  const countRow = queryOne(
    `SELECT COUNT(*) as total FROM products p JOIN suppliers s ON p.supplier_id = s.id WHERE ${where}`,
    params
  );
  const total = countRow ? countRow.total : 0;

  const products = queryAll(
    `SELECT p.*, s.name as supplier_name FROM products p JOIN suppliers s ON p.supplier_id = s.id WHERE ${where} ORDER BY ${orderCol} ${order} LIMIT ? OFFSET ?`,
    [...params, limit || 100, offset || 0]
  );

  return { products, total };
}

export default db;
