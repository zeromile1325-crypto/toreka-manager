/**
 * ãã¬ã«ä»å¥ç®¡çã·ã¹ãã  - LINE Bot + Web API + ããã·ã¥ãã¼ã
 *
 * 1ã¤ã®ãã¡ã¤ã«ã§ãã¹ã¦å®çµããæ§æï¼åå¿èåãï¼
 * - LINE Bot Webhook: ã°ã«ã¼ãæç¨¿ãèªååå¾
 * - AIè§£æ: åååã»ä¾¡æ ¼ã»æ°éãèªåæ½åº
 * - REST API: Webã¢ããªç¨ã®ãã¼ã¿æä¾
 * - Webããã·ã¥ãã¼ã: HTMLãç´æ¥éä¿¡
 */

const express = require("express");
const crypto = require("crypto");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

// ===== ããã«ã¦ã§ã¢ =====
app.use(cors());

// LINE Webhookç¨ï¼ç½²åæ¤è¨¼ï¼
app.use("/webhook", express.json({
  verify: (req, res, buf) => {
    const secret = process.env.LINE_CHANNEL_SECRET;
    if (!secret) return; // æªè¨­å®ã®å ´åã¯ã¹ã­ããï¼éçºç¨ï¼
    const signature = req.headers["x-line-signature"];
    if (!signature) return;
    const hash = crypto.createHmac("sha256", secret).update(buf).digest("base64");
    if (hash !== signature) throw new Error("Invalid LINE signature");
  }
}));

// ãã®ä»ã®ã«ã¼ãç¨
app.use(express.json());

// ===== ãã¼ã¿ãã¼ã¹ï¼ã¤ã³ã¡ã¢ãªï¼=====
// â» æ¬çªã§ã¯PostgreSQLç­ã«ç½®ãæãæ¨å¥¨
const db = {
  products: [],
  rawMessages: [],
  inventory: [],
  nextId: 1,
};

// ===== ã«ãã´ãªèªåå¤å® =====
function detectCategory(text) {
  const t = text.toLowerCase();
  if (/ãã±ã¢ã³|ãã±ã«|pokemon|ãã¤ãªã¬ãã|ã¹ã«ã¼ã¬ãã|151|ãµã¤ãã¼ã¸ã£ãã¸|ã¯ã¤ã«ããã©ã¼ã¹|å¤ä»£ã®åå®|æªæ¥ã®ä¸é|ã¬ã¤ã¸ã³ã°ãµã¼ã|é»çã®æ¯éè|ã¯ã¬ã¤ãã¼ã¹ã|ã¹ãã¼ãã¶ã¼ã|ããªãã¬ãã|ã·ã£ã¤ãã¼ãã¬ã¸ã£ã¼|å¤å¹»ã®ä»®é¢|ã¹ãã©ãã©ã¯ã«/.test(t)) return "ãã±ã¢ã³";
  if (/ã¯ã³ãã¼ã¹|onepiece|one piece|ã¯ã³ã|op-|ã­ãã³ã¹ãã¼ã³|é ä¸æ±ºæ¦|æ°æä»£/.test(t)) return "ã¯ã³ãã¼ã¹";
  if (/éæ¯ç|yugioh|yu-gi-oh|ãã¥ã¨ã«|quarter century|qcb|animation chronicle/.test(t)) return "éæ¯ç";
  if (/ãã©ã´ã³ãã¼ã«|dragon\s*ball|ãã©ã|fb0|è¦éã®é¼å/.test(t)) return "ãã©ã´ã³ãã¼ã«";
  if (/ã´ã¡ã¤ã¹|weiss|ã·ã¥ã´ã¡ã«ã/.test(t)) return "ã´ã¡ã¤ã¹ã·ã¥ã´ã¡ã«ã";
  if (/ãã¥ã¨ã|ãã¥ã¨ã«ãã¹ã¿ã¼ãº|duel masters/.test(t)) return "ãã¥ã¨ã«ãã¹ã¿ã¼ãº";
  return "ãã®ä»";
}

// ===== ã¡ãã»ã¼ã¸è§£æï¼æ­£è¦è¡¨ç¾ãã¼ã¹ï¼=====
function parseProductMessage(text, senderName) {
  // ä¾¡æ ¼ãã¿ã¼ã³
  const pricePatterns = [
    /(\d{1,3}(?:,\d{3})*|\d+)\s*å/,
    /ï¿¥\s*(\d{1,3}(?:,\d{3})*|\d+)/,
    /(\d{4,6})\s*(?:ã§|ã«ã¦)/,
    /åä¾¡\s*(\d{1,3}(?:,\d{3})*|\d+)/,
  ];

  // æ°éãã¿ã¼ã³
  const qtyPatterns = [
    /(\d+)\s*(?:å|ã¤|ç®±|BOX|box|ããã¯ã¹|ã»ãã|set|ã«ã¼ãã³|ã±ã¼ã¹|cs)/i,
    /(?:æ®ã|ã©ã¹ã|ãã¨|å¨åº«)\s*(\d+)/,
    /Ã\s*(\d+)/,
    /x\s*(\d+)/i,
  ];

  let price = null;
  for (const pat of pricePatterns) {
    const m = text.match(pat);
    if (m) { price = parseInt(m[1].replace(/,/g, "")); break; }
  }

  let quantity = null;
  for (const pat of qtyPatterns) {
    const m = text.match(pat);
    if (m) { quantity = parseInt(m[1]); break; }
  }

  // ä¾¡æ ¼ãåããªããã°ååæç¨¿ã§ã¯ãªãã¨å¤æ­
  if (!price) return null;
  // æããã«ä½ãããã»é«ãããä¾¡æ ¼ã¯é¤å¤
  if (price < 100 || price > 1000000) return null;

  // åååã®æ¨å®ï¼ä¾¡æ ¼ã»æ°éã®è¡¨è¨ãé¤å»ï¼
  let productName = text
    .replace(/(\d{1,3}(?:,\d{3})*|\d+)\s*å/g, "")
    .replace(/ï¿¥\s*(\d{1,3}(?:,\d{3})*|\d+)/g, "")
    .replace(/(\d+)\s*(?:å|ã¤|ç®±|BOX|box|ããã¯ã¹|ã»ãã|set|ã«ã¼ãã³|ã±ã¼ã¹|cs)/gi, "")
    .replace(/(?:æ®ã|ã©ã¹ã|ãã¨|å¨åº«)\s*\d+/g, "")
    .replace(/(\d{4,6})\s*(?:ã§|ã«ã¦)/g, "")
    .replace(/åä¾¡\s*\d+/g, "")
    .replace(/Ã\s*\d+/g, "")
    .replace(/[ããï¼!ï¼?â¦]+/g, "")
    .replace(/å³ç´|å³æ¥|ç¿æ¥|çºéå¯|åºãã¾ã|ããã¾ã|åºå|å¤ä¸ã|ç¹ä¾¡|ã»ã¼ã«/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!productName || productName.length < 2) productName = "ä¸æãªåå";

  const category = detectCategory(productName + " " + text);

  return {
    productName,
    category,
    price,
    quantity: quantity || 1,
    seller: senderName,
  };
}

// ===== AIè§£æï¼Claude API ä½¿ç¨ï¼=====
async function aiParseMessage(text, senderName) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{
          role: "user",
          content: `ããªãã¯ãã¬ã¼ãã£ã³ã°ã«ã¼ãã®ä»å¥ãæå ±ãè§£æããã¢ã·ã¹ã¿ã³ãã§ãã
ä»¥ä¸ã®LINEã°ã«ã¼ãã®ã¡ãã»ã¼ã¸ããååæå ±ãæ½åºãã¦ãã ããã

ã¡ãã»ã¼ã¸: "${text}"
æç¨¿è: ${senderName}

ä»¥ä¸ã®JSONå½¢å¼ã§è¿ãã¦ãã ããï¼JSONã®ã¿ãèª¬æä¸è¦ï¼:
{
  "isProductPost": true ã¾ãã¯ false,
  "productName": "æ­£å¼ãªååå",
  "category": "ãã±ã¢ã³" | "ã¯ã³ãã¼ã¹" | "éæ¯ç" | "ãã©ã´ã³ãã¼ã«" | "ã´ã¡ã¤ã¹ã·ã¥ã´ã¡ã«ã" | "ãã¥ã¨ã«ãã¹ã¿ã¼ãº" | "ãã®ä»",
  "price": æ°å¤ï¼åï¼,
  "quantity": æ°å¤ ã¾ãã¯ null
}

ååã®åºåã»è²©å£²ã«é¢ããã¡ãã»ã¼ã¸ã§ãªããã° isProductPost: false ã¨ãã¦ãã ããã`
        }],
      }),
    });

    const data = await resp.json();
    const parsed = JSON.parse(data.content[0].text);

    if (!parsed.isProductPost) return null;

    return {
      productName: parsed.productName,
      category: parsed.category,
      price: parsed.price,
      quantity: parsed.quantity || 1,
      seller: senderName,
    };
  } catch (err) {
    console.error("[AIè§£æã¨ã©ã¼]", err.message);
    return null;
  }
}

// ===== LINEéä¿¡èåã®åå¾ =====
async function getSenderName(source) {
  const token = process.env.LINE_CHANNEL_TOKEN;
  if (!token || !source.groupId || !source.userId) return "ä¸æ";

  try {
    const resp = await fetch(
      `https://api.line.me/v2/bot/group/${source.groupId}/member/${source.userId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await resp.json();
    return data.displayName || "ä¸æ";
  } catch {
    return "ä¸æ";
  }
}

// ================================================================
//  LINE Webhook ã¨ã³ããã¤ã³ã
// ================================================================
app.post("/webhook", async (req, res) => {
  res.status(200).json({ status: "ok" });

  const events = req.body.events || [];
  console.log(`[Webhook] ${events.length}ä»¶ã®ã¤ãã³ãåä¿¡`);

  for (const event of events) {
    if (event.type !== "message" || event.message.type !== "text") continue;

    const text = event.message.text;
    const senderName = await getSenderName(event.source);
    const timestamp = new Date(event.timestamp).toISOString();

    // çã¡ãã»ã¼ã¸ä¿å­
    const rawMsg = {
      id: db.nextId++,
      sender: senderName,
      message: text,
      timestamp,
      parsed: false,
    };
    db.rawMessages.push(rawMsg);
    console.log(`[åä¿¡] ${senderName}: ${text}`);

    // 1. ã¾ãæ­£è¦è¡¨ç¾ã§è§£æ
    let parsed = parseProductMessage(text, senderName);

    // 2. å¤±æãããAIè§£æ
    if (!parsed) {
      parsed = await aiParseMessage(text, senderName);
    }

    if (parsed) {
      const product = {
        id: db.nextId++,
        name: parsed.productName,
        category: parsed.category,
        price: parsed.price,
        quantity: parsed.quantity,
        seller: parsed.seller,
        source: "LINE",
        date: timestamp,
        status: "available",
        notes: "",
      };
      db.products.push(product);
      rawMsg.parsed = true;
      console.log(`[è§£æOK] ${parsed.productName} Â¥${parsed.price} x${parsed.quantity} (${parsed.seller})`);
    } else {
      console.log(`[è§£æNG] ã¡ãã»ã¼ã¸ãã¹ã­ãã: "${text.substring(0, 30)}..."`);
    }
  }
});

// ================================================================
//  REST API ã¨ã³ããã¤ã³ãï¼Webã¢ããªç¨ï¼
// ================================================================

// ååä¸è¦§
app.get("/api/products", (req, res) => {
  let list = [...db.products];

  if (req.query.q) {
    const q = req.query.q.toLowerCase();
    list = list.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.seller.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    );
  }
  if (req.query.category && req.query.category !== "ãã¹ã¦") {
    list = list.filter(p => p.category === req.query.category);
  }
  if (req.query.status) {
    list = list.filter(p => p.status === req.query.status);
  }

  const sortField = req.query.sort || "date";
  const sortDir = req.query.dir || "desc";
  list.sort((a, b) => {
    let va = a[sortField], vb = b[sortField];
    if (typeof va === "string") { va = va.toLowerCase(); vb = vb.toLowerCase(); }
    return sortDir === "asc" ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
  });

  res.json({ products: list, total: list.length });
});

// ååè¿½å 
app.post("/api/products", (req, res) => {
  const { name, category, price, quantity, seller, notes } = req.body;
  if (!name || !price) return res.status(400).json({ error: "åååã¨ä¾¡æ ¼ã¯å¿é ã§ã" });

  const product = {
    id: db.nextId++,
    name,
    category: category || detectCategory(name),
    price: Number(price),
    quantity: Number(quantity) || 1,
    seller: seller || "æåå¥å",
    source: "æå",
    date: new Date().toISOString(),
    status: "available",
    notes: notes || "",
  };
  db.products.push(product);
  res.status(201).json(product);
});

// ååã¹ãã¼ã¿ã¹æ´æ°
app.patch("/api/products/:id", (req, res) => {
  const product = db.products.find(p => p.id === Number(req.params.id));
  if (!product) return res.status(404).json({ error: "ååãè¦ã¤ããã¾ãã" });
  Object.assign(product, req.body);
  res.json(product);
});

// ä¾¡æ ¼æ¯è¼
app.get("/api/compare", (req, res) => {
  const groups = {};
  db.products.filter(p => p.status === "available").forEach(p => {
    // åååãæ­£è¦åãã¦æ¯è¼ï¼ã¹ãã¼ã¹ãè¡¨è¨æºããå¸åï¼
    const key = p.name.replace(/\s+/g, "").toLowerCase();
    if (!groups[key]) groups[key] = { name: p.name, items: [] };
    groups[key].items.push(p);
  });

  const comparisons = Object.values(groups)
    .filter(g => g.items.length > 1)
    .map(g => {
      g.items.sort((a, b) => a.price - b.price);
      return {
        name: g.name,
        items: g.items,
        minPrice: g.items[0].price,
        maxPrice: g.items[g.items.length - 1].price,
        diff: g.items[g.items.length - 1].price - g.items[0].price,
        bestSeller: g.items[0].seller,
      };
    })
    .sort((a, b) => b.diff - a.diff);

  res.json({ comparisons });
});

// å¨åº«ä¸ç§§
app.get("/api/inventory", (req, res) => {
  res.json({ inventory: db.inventory });
});

// ä»å¥ãç»é²
app.post("/api/inventory", (req, res) => {
  const { productId, sellingPrice } = req.body;
  const product = db.products.find(p => p.id === Number(productId));
  if (!product) return res.status(404).json({ error: "ååãè¦ã¤ããã¾ãã" });

  const invItem = {
    id: db.nextId++,
    productName: product.name,
    category: product.category,
    purchasePrice: product.price,
    sellingPrice: Number(sellingPrice),
    stock: product.quantity,
    seller: product.seller,
    purchaseDate: new Date().toISOString().split("T")[0],
    status: "in_stock",
  };
  db.inventory.push(invItem);
  product.status = "purchased";
  res.status(201).json(invItem);
});

// å¨åº«æ´æ°
app.patch("/api/inventory/:id", (req, res) => {
  const item = db.inventory.find(i => i.id === Number(req.params.id));
  if (!item) return res.status(404).json({ error: "å¨åº«ãè¦ã¤ããã¾ãã" });
  Object.assign(item, req.body);
  if (item.stock <= 0) item.status = "sold_out";
  res.json(item);
});

// LINEã¡ãã»ã¼ã¸ä¸è¦§
app.get("/api/messages", (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json({ messages: db.rawMessages.slice(-limit).reverse() });
});

// çµ±è¨
app.get("/api/stats", (req, res) => {
  const total = db.rawMessages.length;
  const parsed = db.rawMessages.filter(m => m.parsed).length;
  const sellers = [...new Set(db.products.map(p => p.seller))];
  const today = new Date().toISOString().split("T")[0];
  const todayNew = db.products.filter(p => p.date.startsWith(today)).length;

  res.json({
    totalMessages: total,
    parsedMessages: parsed,
    parseRate: total > 0 ? Math.round((parsed / total) * 100) : 0,
    totalProducts: db.products.length,
    availableProducts: db.products.filter(p => p.status === "available").length,
    totalInventoryValue: db.inventory.reduce((s, i) => s + i.purchasePrice * i.stock, 0),
    potentialProfit: db.inventory.reduce((s, i) => s + (i.sellingPrice - i.purchasePrice) * i.stock, 0),
    totalStock: db.inventory.reduce((s, i) => s + i.stock, 0),
    sellerCount: sellers.length,
    todayNew,
  });
});

// ================================================================
//  Webããã·ã¥ãã¼ãï¼HTMLç´æ¥éä¿¡ï¼
// ================================================================
app.get("/", (req, res) => {
  res.send(getDashboardHTML());
});

function getDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ãã¬ã«ä»å¥ç®¡ç</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/tailwindcss/2.2.19/tailwind.min.js"></script>
  <style>
    * { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', sans-serif; }
    .tab-active { border-bottom: 2px solid #4F46E5; color: #4F46E5; }
    .badge-available { background: #D1FAE5; color: #065F46; }
    .badge-purchased { background: #DBEAFE; color: #1E40AF; }
    .badge-sold { background: #F3F4F6; color: #6B7280; }
    .badge-in_stock { background: #D1FAE5; color: #065F46; }
    .badge-sold_out { background: #FEE2E2; color: #991B1B; }
    .best-price { background: #ECFDF5; }
    .stat-card { transition: transform 0.15s; }
    .stat-card:hover { transform: translateY(-2px); }
    table { border-collapse: collapse; }
    th, td { text-align: left; }
    .loading { animation: pulse 1.5s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    .modal-overlay { background: rgba(0,0,0,0.4); }
  </style>
</head>
<body class="bg-gray-50 min-h-screen">

  <!-- ãããã¼ -->
  <header class="bg-white border-b sticky top-0 z-30">
    <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
          <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
          </svg>
        </div>
        <h1 class="text-lg font-bold text-gray-900">ãã¬ã«ä»å¥ç®¡ç</h1>
        <span class="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-medium">æµ·å¤ç´è²©</span>
      </div>
      <div class="flex items-center gap-2 text-sm text-gray-500">
        <span id="lastUpdate">èª­ã¿è¾¼ã¿ä¸­...</span>
      </div>
    </div>
    <div class="max-w-7xl mx-auto px-4">
      <nav class="flex gap-1 -mb-px" id="tabNav">
        <button onclick="switchTab('dashboard')" class="tab-btn tab-active px-4 py-2.5 text-sm font-medium border-b-2" data-tab="dashboard">ããã·ã¥ãã¼ã</button>
        <button onclick="switchTab('products')" class="tab-btn px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700" data-tab="products">ååä¸è¦§</button>
        <button onclick="switchTab('compare')" class="tab-btn px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700" data-tab="compare">ä¾¡æ ¼æ¯è¼</button>
        <button onclick="switchTab('inventory')" class="tab-btn px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700" data-tab="inventory">å¨åº«ç®¡ç</button>
        <button onclick="switchTab('line')" class="tab-btn px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700" data-tab="line">LINEåè¾¼</button>
      </nav>
    </div>
  </header>

  <main class="max-w-7xl mx-auto px-4 py-6">
    <!-- ããã·ã¥ãã¼ã -->
    <div id="tab-dashboard" class="tab-content">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="stat-card bg-white rounded-xl shadow-sm border p-4">
          <p class="text-xs text-gray-500 font-medium">è²©å£²ä¸­ã®åå</p>
          <p class="text-2xl font-bold text-gray-900 mt-1" id="stat-available">-</p>
          <p class="text-xs text-gray-400 mt-1" id="stat-today">æ¬æ¥ +0ä»¶</p>
        </div>
        <div class="stat-card bg-white rounded-xl shadow-sm border p-4">
          <p class="text-xs text-gray-500 font-medium">åå±æ°</p>
          <p class="text-2xl font-bold text-gray-900 mt-1" id="stat-sellers">-</p>
          <p class="text-xs text-gray-400 mt-1">ã¢ã¯ãã£ã</p>
        </div>
        <div class="stat-card bg-white rounded-xl shadow-sm border p-4">
          <p class="text-xs text-gray-500 font-medium">å¨åº«ç·é¡</p>
          <p class="text-2xl font-bold text-gray-900 mt-1" id="stat-value">-</p>
          <p class="text-xs text-gray-400 mt-1">ä»å¥åä¾¡ãã¼ã¹</p>
        </div>
        <div class="stat-card bg-white rounded-xl shadow-sm border p-4">
          <p class="text-xs text-gray-500 font-medium">è¦è¾¼ã¿å©ç</p>
          <p class="text-2xl font-bold text-gray-900 mt-1" id="stat-profit">-</p>
          <p class="text-xs text-gray-400 mt-1">å¨åº«å</p>
        </div>
      </div>
      <div class="bg-white rounded-xl shadow-sm border p-5 mb-6">
        <h2 class="text-sm font-semibold text-gray-700 mb-3">ç´è¿ã®LINEåè¾¼</h2>
        <div id="recentMessages" class="space-y-2 text-sm text-gray-500">ãã¼ã¿ãèª­ã¿è¾¼ã¿ä¸­...</div>
      </div>
    </div>

    <!-- ååä¸è¦§ -->
    <div id="tab-products" class="tab-content hidden">
      <div class="flex flex-wrap gap-3 items-center mb-4">
        <div class="relative flex-1" style="min-width:250px">
          <input type="text" id="searchInput" placeholder="åååã»åºåèãæ¤ç´¢..." oninput="loadProducts()"
            class="w-full pl-4 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
        </div>
        <div class="flex gap-1" id="categoryFilters"></div>
        <button onclick="showAddModal()" class="px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700">+ æåè¿½å </button>
      </div>
      <div class="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50">
                <th class="px-4 py-3 font-medium text-gray-600">ååå</th>
                <th class="px-4 py-3 font-medium text-gray-600">ã«ãã´ãª</th>
                <th class="px-4 py-3 font-medium text-gray-600">ä¾¡æ ¼</th>
                <th class="px-4 py-3 font-medium text-gray-600">æ°é</th>
                <th class="px-4 py-3 font-medium text-gray-600">åºåè</th>
                <th class="px-4 py-3 font-medium text-gray-600">åè¾¼å</th>
                <th class="px-4 py-3 font-medium text-gray-600">æ¥æ</th>
                <th class="px-4 py-3 font-medium text-gray-600">ã¹ãã¼ã¿ã¹</th>
              </tr>
            </thead>
            <tbody id="productsTable" class="divide-y"></tbody>
          </table>
        </div>
        <div class="px-4 py-3 bg-gray-50 text-xs text-gray-500 border-t" id="productsCount">0ä»¶</div>
      </div>
    </div>

    <!-- ä¾¡æ ¼æ¯è¼ -->
    <div id="tab-compare" class="tab-content hidden">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-base font-semibold text-gray-800">åä¸ååã®ä¾¡æ ¼æ¯è¼</h2>
        <p class="text-sm text-gray-500">åãååãè¤æ°ã®åå±ãåºåããå ´åã«èªåæ¯è¼</p>
      </div>
      <div id="compareContent" class="space-y-4 text-gray-500">ãã¼ã¿ãèª­ã¿è¾¼ã¿ä¸­...</div>
    </div>

    <!-- å¨åº«ç®¡ç -->
    <div id="tab-inventory" class="tab-content hidden">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-base font-semibold text-gray-800">å¨åº«ã»ä»å¥ç®¡ç</h2>
      </div>
      <div class="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-gray-50">
              <th class="px-5 py-3 font-medium text-gray-600">ååå</th>
              <th class="px-5 py-3 font-medium text-gray-600">ä»å¥å</th>
              <th class="px-5 py-3 font-medium text-gray-600">ä»å¥ä¾¡æ ¼</th>
              <th class="px-5 py-3 font-medium text-gray-600">è²©å£²ä¾¡æ ¼</th>
              <th class="px-5 py-3 font-medium text-gray-600">å©ç</th>
              <th class="px-5 py-3 font-medium text-gray-600">å©çç</th>
              <th class="px-5 py-3 font-medium text-gray-600">å¨åº«æ°</th>
              <th class="px-5 py-3 font-medium text-gray-600">ç¶æ</th>
            </tr>
          </thead>
          <tbody id="inventoryTable" class="divide-y"></tbody>
        </table>
        <div class="px-5 py-3 bg-gray-50 border-t text-sm" id="inventorySummary"></div>
      </div>
    </div>

    <!-- LINEåè¾¼ -->
    <div id="tab-line" class="tab-content hidden">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-base font-semibold text-gray-800">LINE ã°ã«ã¼ãåè¾¼ç¶æ³</h2>
        <span class="flex items-center gap-1.5 text-sm text-green-600">
          <span class="w-2 h-2 bg-green-500 rounded-full" style="animation: pulse 1.5s infinite"></span>Botç¨tåä¸­
        </span>
      </div>
      <div class="bg-indigo-50 rounded-xl p-5 border border-indigo-100 mb-4">
        <h3 class="text-sm font-semibold text-indigo-800 mb-2">LINE Bot ã®ä»çµã¿</h3>
        <div class="text-sm text-indigo-700 space-y-1">
          <p>1. ã°ã«ã¼ãLINEã«æç¨¿ãããã¡ãã»ã¼ã¸ãBotãèªååå¾</p>
          <p>2. AIï¼èªç¶è¨èªå¦çï¼ã§åååã»ä¾¡æ ¼ã»æ°éã»åºåèãèªåè§£æ</p>
          <p>3. è§£æçµæããã¼ã¿ãã¼ã¹ã«ä¿å­ããããã·ã¥ãã¼ãã«åæ </p>
          <p>4. è§£æã§ããªãã£ãã¡ãã»ã¼ã¸ã¯æåç¢ºèªã­ã¥ã¼ã«å¥ãã¾ã</p>
        </div>
      </div>
      <div class="grid grid-cols-3 gap-4 mb-4">
        <div class="bg-white rounded-xl shadow-sm border p-4 text-center">
          <p class="text-2xl font-bold text-green-600" id="stat-parseRate">-</p>
          <p class="text-xs text-gray-500 mt-1">èªåè§£ææåç</p>
        </div>
        <div class="bg-white rounded-xl shadow-sm border p-4 text-center">
          <p class="text-2xl font-bold text-gray-800" id="stat-totalMessages">-</p>
          <p class="text-xs text-gray-500 mt-1">ç·åè½¼ä»¶æ°</p>
        </div>
        <div class="bg-white rounded-xl shadow-sm border p-4 text-center">
          <p class="text-2xl font-bold text-amber-600" id="stat-unparsed">-</p>
          <p class="text-xs text-gray-500 mt-1">è¦ç¢ºèªã¡ãã»ã¼ã¸</p>
        </div>
      </div>
      <div class="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div class="px-5 py-3 border-b bg-gray-50"><h3 class="text-sm font-medium text-gray-600">ã¡ãã»ã¼ã¸ä¸è¦§</h3></div>
        <div id="messagesList" class="divide-y text-sm text-gray-500 p-4">ãã¼ã¿ãèª­ã¿è¾¼ã¿ä¸­...</div>
      </div>
    </div>
  </main>

  <!-- æåè¿½å ã¢ã¼ãã« -->
  <div id="addModal" class="fixed inset-0 modal-overlay z-50 hidden flex items-center justify-center p-4">
    <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold">ååãæåè¿½å </h3>
        <button onclick="hideAddModal()" class="p-1 hover:bg-gray-100 rounded-lg text-xl">&times;</button>
      </div>
      <div class="space-y-3">
        <div><label class="block text-xs font-medium text-gray-600 mb-1">ååå *</label>
          <input type="text" id="addName" placeholder="ä¾: ãã±ã¢ã³ã«ã¼ã 151 BOX" class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"></div>
        <div><label class="block text-xs font-medium text-gray-600 mb-1">ã«ãã´ãª</label>
          <select id="addCategory" class="w-full px-3 py-2 border rounded-lg text-sm">
            <option value="">èªåå¤å®</option>
            <option>ãã±ã¢ã³</option><option>ã¯ã³ãã¼ã¹</option><option>éæ¯ç</option>
            <option>ãã©ã´ã³ãã¼ã«</option><option>ãã®ä»</option>
          </select></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="block text-xs font-medium text-gray-600 mb-1">ä¾¡æ ¼ï¼åï¼*</label>
            <input type="number" id="addPrice" placeholder="18500" class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"></div>
          <div><label class="block text-xs font-medium text-gray-600 mb-1">æ°é</label>
            <input type="number" id="addQty" placeholder="1" value="1" class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"></div>
        </div>
        <div><label class="block text-xs font-medium text-gray-600 mb-1">åºåè</label>
          <input type="text" id="addSeller" placeholder="ä¾: ç°ä¸­åäº" class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"></div>
        <div><label class="block text-xs font-medium text-gray-600 mb-1">åè</label>
          <input type="text" id="addNotes" placeholder="ã¡ã¢" class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"></div>
      </div>
      <div class="flex gap-2 mt-5">
        <button onclick="hideAddModal()" class="flex-1 px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">ã­ã£ã³ã»ã«</button>
        <button onclick="addProduct()" class="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">è¿½å ãã</button>
      </div>
    </div>
  </div>

<script>
  const API = '';
  const categories = ['ãã¹ã¦', 'ãã±ã¢ã³', 'ã¯ã³ãã¼ã¹', 'éæ¯ç', 'ãã©ã´ã³ãã¼ã«'];
  let currentCategory = 'ãã¹ã¦';
  const statusLabels = { available: 'è²©å£²ä¸­', purchased: 'ä»å¥æ¸', sold: 'å®å£²', in_stock: 'å¨åº«ãã', sold_out: 'å¨åº«åã' };
  const fmt = n => 'Â¥' + Number(n).toLocaleString();

  function badge(status) {
    return '<span class="badge-' + status + ' px-2 py-0.5 rounded-full text-xs font-medium">' + (statusLabels[status] || status) + '</span>';
  }

  // ã¿ãåãæ¿ã
  function switchTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById('tab-' + tab).classList.remove('hidden');
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.remove('tab-active');
      btn.classList.add('border-transparent', 'text-gray-500');
    });
    const activeBtn = document.querySelector('[data-tab="' + tab + '"]');
    activeBtn.classList.add('tab-active');
    activeBtn.classList.remove('border-transparent', 'text-gray-500');

    if (tab === 'products') loadProducts();
    if (tab === 'compare') loadCompare();
    if (tab === 'inventory') loadInventory();
    if (tab === 'line') loadMessages();
  }

  // ãã¼ã¿èª­ã¿è¾¼ã¿
  async function loadStats() {
    try {
      const res = await fetch(API + '/api/stats');
      const data = await res.json();
      document.getElementById('stat-available').textContent = data.availableProducts;
      document.getElementById('stat-today').textContent = 'æ¬æ¥ +' + data.todayNew + 'ä»¶';
      document.getElementById('stat-sellers').textContent = data.sellerCount;
      document.getElementById('stat-value').textContent = fmt(data.totalInventoryValue);
      document.getElementById('stat-profit').textContent = fmt(data.potentialProfit);
      document.getElementById('stat-parseRate').textContent = data.parseRate + '%';
      document.getElementById('stat-totalMessages').textContent = data.totalMessages;
      document.getElementById('stat-unparsed').textContent = data.totalMessages - data.parsedMessages;
      document.getElementById('lastUpdate').textContent = 'æçµæ´æ°: ' + new Date().toLocaleString('ja-JP');
    } catch(e) { console.log('Stats load error', e); }
  }

  async function loadProducts() {
    try {
      const q = document.getElementById('searchInput')?.value || '';
      const cat = currentCategory !== 'ãã¹ã¦' ? '&category=' + encodeURIComponent(currentCategory) : '';
      const res = await fetch(API + '/api/products?q=' + encodeURIComponent(q) + cat + '&sort=date&dir=desc');
      const data = await res.json();

      const tbody = document.getElementById('productsTable');
      if (data.products.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="px-4 py-12 text-center text-gray-400">ååãããã¾ãããLINE Botããã®åè¾¼ or æåè¿½å ãã¦ãã ããã</td></tr>';
      } else {
        tbody.innerHTML = data.products.map(p =>
          '<tr class="hover:bg-gray-50">' +
          '<td class="px-4 py-3 font-medium text-gray-900">' + p.name + '</td>' +
          '<td class="px-4 py-3"><span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">' + p.category + '</span></td>' +
          '<td class="px-4 py-3 font-semibold">' + fmt(p.price) + '</td>' +
          '<td class="px-4 py-3 text-gray-600">' + p.quantity + 'å</td>' +
          '<td class="px-4 py-3 text-gray-600">' + p.seller + '</td>' +
          '<td class="px-4 py-3"><span class="text-xs px-2 py-0.5 rounded ' + (p.source === 'LINE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500') + '">' + p.source + '</span></td>' +
          '<td class="px-4 py-3 text-gray-500 text-xs">' + new Date(p.date).toLocaleString('ja-JP') + '</td>' +
          '<td class="px-4 py-3">' + badge(p.status) + '</td>' +
          '</tr>'
        ).join('');
      }
      document.getElementById('productsCount').textContent = data.total + 'ä»¶ã®ååãè¡¨ç¤ºä¸­';
    } catch(e) { console.log('Products load error', e); }
  }

  async function loadCompare() {
    try {
      const res = await fetch(API + '/api/compare');
      const data = await res.json();
      const el = document.getElementById('compareContent');

      if (data.comparisons.length === 0) {
        el.innerHTML = '<div class="bg-white rounded-xl shadow-sm border p-12 text-center text-gray-400"><p>æ¯è¼å¯è½ãªååãããã¾ãã</p><p class="text-xs mt-2">åãååãè¤æ°ã®åå±ãåºåããã¨èªåæ¯è¼ããã¾ã</p></div>';
        return;
      }

      el.innerHTML = data.comparisons.map(g =>
        '<div class="bg-white rounded-xl shadow-sm border overflow-hidden">' +
        '<div class="px-5 py-4 border-b flex items-center justify-between">' +
        '<h3 class="font-semibold text-gray-900">' + g.name + '</h3>' +
        '<div class="flex items-center gap-3 text-sm">' +
        '<span class="text-green-600 font-semibold">æå® ' + fmt(g.minPrice) + '</span>' +
        '<span class="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-xs font-medium">å·®é¡ ' + fmt(g.diff) + '</span>' +
        '</div></div>' +
        '<table class="w-full text-sm"><thead><tr class="bg-gray-50">' +
        '<th class="px-5 py-2 font-medium text-gray-600">åºåè</th>' +
        '<th class="px-5 py-2 font-medium text-gray-600">ä¾¡æ ¼</th>' +
        '<th class="px-5 py-2 font-medium text-gray-600">æ°é</th>' +
        '<th class="px-5 py-2 font-medium text-gray-600">æ¥æ</th>' +
        '</tr></thead><tbody class="divide-y">' +
        g.items.map((item, idx) =>
          '<tr class="' + (idx === 0 ? 'best-price' : 'hover:bg-gray-50') + '">' +
          '<td class="px-5 py-3 font-medium">' + item.seller + '</td>' +
          '<td class="px-5 py-3"><span class="font-semibold ' + (idx === 0 ? 'text-green-600' : '') + '">' + fmt(item.price) + '</span>' +
          (idx === 0 ? ' <span class="ml-1 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">æå®</span>' : '') + '</td>' +
          '<td class="px-5 py-3 text-gray-600">' + item.quantity + 'å</td>' +
          '<td class="px-5 py-3 text-gray-500 text-xs">' + new Date(item.date).toLocaleString('ja-JP') + '</td>' +
          '</tr>'
        ).join('') +
        '</tbody></table></div>'
      ).join('');
    } catch(e) { console.log('Compare load error', e); }
  }

  async function loadInventory() {
    try {
      const res = await fetch(API + '/api/inventory');
      const data = await res.json();
      const tbody = document.getElementById('inventoryTable');

      if (data.inventory.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="px-5 py-12 text-center text-gray-400">å¨åº«ãããã¾ãããååä¸è¦§ãããä»å¥ãããã§ç»é²ã§ãã¾ãã</td></tr>';
        document.getElementById('inventorySummary').textContent = '';
        return;
      }

      tbody.innerHTML = data.inventory.map(item => {
        const profit = item.sellingPrice - item.purchasePrice;
        const margin = ((profit / item.purchasePrice) * 100).toFixed(1);
        return '<tr class="hover:bg-gray-50">' +
          '<td class="px-5 py-3 font-medium text-gray-900">' + item.productName + '</td>' +
          '<td class="px-5 py-3 text-gray-600">' + item.seller + '</td>' +
          '<td class="px-5 py-3">' + fmt(item.purchasePrice) + '</td>' +
          '<td class="px-5 py-3 font-semibold">' + fmt(item.sellingPrice) + '</td>' +
          '<td class="px-5 py-3 text-green-600 font-semibold">' + fmt(profit) + '</td>' +
          '<td class="px-5 py-3"><span class="text-xs font-semibold px-2 py-0.5 rounded ' +
          (parseFloat(margin) >= 20 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700') + '">' + margin + '%</span></td>' +
          '<td class="px-5 py-3 font-semibold">' + item.stock + '</td>' +
          '<td class="px-5 py-3">' + badge(item.status) + '</td></tr>';
      }).join('');

      const totalStock = data.inventory.reduce((s, i) => s + i.stock, 0);
      const totalValue = data.inventory.reduce((s, i) => s + i.purchasePrice * i.stock, 0);
      document.getElementById('inventorySummary').innerHTML =
        '<span class="text-gray-500">åè¨å¨åº«: ' + totalStock + 'å</span>' +
        '<span class="float-right font-semibold text-gray-700">å¨åº«ç·é¡: ' + fmt(totalValue) + '</span>';
    } catch(e) { console.log('Inventory load error', e); }
  }

  async function loadMessages() {
    try {
      const res = await fetch(API + '/api/messages');
      const data = await res.json();
      const el = document.getElementById('messagesList');

      if (data.messages.length === 0) {
        el.innerHTML = '<p class="text-center py-8 text-gray-400">ã¡ãã»ã¼ã¸ãã¾ã ããã¾ãããLINE Botãã°ã«ã¼ãã«è¿½å ãã¦ãã ããã</p>';
        return;
      }

      el.innerHTML = data.messages.map(m =>
        '<div class="flex items-start gap-4 py-3">' +
        '<div class="w-9 h-9 bg-green-100 rounded-full flex items-center justify-center shrink-0">' +
        '<svg class="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>' +
        '</div><div class="flex-1 min-w-0">' +
        '<div class="flex items-center gap-2"><span class="font-medium text-gray-800 text-sm">' + m.sender + '</span>' +
        '<span class="text-xs text-gray-400">' + new Date(m.timestamp).toLocaleString('ja-JP') + '</span></div>' +
        '<p class="text-sm text-gray-600 mt-0.5">' + m.message + '</p>' +
        '</div><div class="shrink-0">' +
        (m.parsed
          ? '<span class="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">è§£ææ¸ã¿</span>'
          : '<span class="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full">è¦ç¢ºèª</span>') +
        '</div></div>'
      ).join('');
    } catch(e) { console.log('Messages load error', e); }
  }

  // ååè¿½å 
  function showAddModal() { document.getElementById('addModal').classList.remove('hidden'); }
  function hideAddModal() { document.getElementById('addModal').classList.add('hidden'); }

  async function addProduct() {
    const name = document.getElementById('addName').value;
    const price = document.getElementById('addPrice').value;
    if (!name || !price) { alert('åååã¨ä¾¡æ ¼ã¯å¿é ã§ã'); return; }

    try {
      await fetch(API + '/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          category: document.getElementById('addCategory').value,
          price: Number(price),
          quantity: Number(document.getElementById('addQty').value) || 1,
          seller: document.getElementById('addSeller').value,
          notes: document.getElementById('addNotes').value,
        }),
      });
      hideAddModal();
      loadProducts();
      loadStats();
      // ãã©ã¼ã ãªã»ãã
      ['addName','addPrice','addSeller','addNotes'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('addQty').value = '1';
      document.getElementById('addCategory').value = '';
    } catch(e) { alert('è¿½å ã«å¤±æãã¾ãã'); }
  }

  // ã«ãã´ãªãã£ã«ã¿çæ
  function renderCategoryFilters() {
    const el = document.getElementById('categoryFilters');
    el.innerHTML = categories.map(c =>
      '<button onclick="setCategory(\\'' + c + '\\')" class="cat-btn px-3 py-1.5 text-xs rounded-full font-medium ' +
      (currentCategory === c ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 border hover:bg-gray-50') + '">' + c + '</button>'
    ).join('');
  }

  function setCategory(cat) {
    currentCategory = cat;
    renderCategoryFilters();
    loadProducts();
  }

  // åæå
  loadStats();
  renderCategoryFilters();

  // 30ç§ãã¨ã«èªåæ´æ°
  setInterval(() => {
    loadStats();
    const activeTab = document.querySelector('.tab-active')?.dataset.tab;
    if (activeTab === 'products') loadProducts();
    if (activeTab === 'compare') loadCompare();
    if (activeTab === 'inventory') loadInventory();
    if (activeTab === 'line') loadMessages();
  }, 30000);
</script>
</body>
</html>`;
}

// ===== ãã«ã¹ãã§ãã¯ =====
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    products: db.products.length,
    messages: db.rawMessages.length,
  });
});

// ===== ãµã¼ãã¼èµ·å =====
app.listen(PORT, () => {
  console.log("");
  console.log("========================================");
  console.log("  ãã¬ã«ä»å¥ç®¡çã·ã¹ãã  èµ·åå®äº");
  console.log("========================================");
  console.log("  ããã·ã¥ãã¼ã: http://localhost:" + PORT);
  console.log("  Webhook URL:   http://localhost:" + PORT + "/webhook");
  console.log("  API:           http://localhost:" + PORT + "/api/");
  console.log("  ãã«ã¹ãã§ãã¯: http://localhost:" + PORT + "/health");
  console.log("========================================");
  console.log("");
  console.log("  LINE_CHANNEL_SECRET: " + (process.env.LINE_CHANNEL_SECRET ? "è¨­å®æ¸ã¿" : "æªè¨­å®"));
  console.log("  LINE_CHANNEL_TOKEN:  " + (process.env.LINE_CHANNEL_TOKEN ? "è¨­å®æ¸ã¿" : "æªè¨­å®"));
  console.log("  ANTHROPIC_API_KEY:   " + (process.env.ANTHROPIC_API_KEY ? "è¨­å®æ¸ã¿" : "æªè¨­å®"));
  console.log("");
});

module.exports = app;
