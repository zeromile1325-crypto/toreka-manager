import { Router } from 'express';
import { middleware, messagingApi } from '@line/bot-sdk';
import { parseMessage } from '../parser.js';
import { findOrCreateSupplier, insertProducts, deactivateBySupplierId, getAllSuppliers, getActiveProducts } from '../db.js';

export default function createWebhookRouter(config) {
  const router = Router();

  const client = new messagingApi.MessagingApiClient({
    channelAccessToken: config.channelAccessToken
  });

  // LINE signature verification middleware
  router.use(middleware({
    channelSecret: config.channelSecret
  }));

  router.post('/', (req, res) => {
    const events = req.body.events || [];

    for (const event of events) {
      try {
        handleEvent(event, client);
      } catch (err) {
        console.error('Event handling error:', err);
      }
    }

    res.status(200).json({ status: 'ok' });
  });

  return router;
}

async function handleEvent(event, client) {
  if (event.type !== 'message' || event.message.type !== 'text') return;

  const text = event.message.text.trim();
  const replyToken = event.replyToken;

  // コマンド処理
  if (text === 'ヘルプ' || text === 'help') {
    await replyText(client, replyToken, HELP_TEXT);
    return;
  }

  if (text.startsWith('検索 ') || text.startsWith('検索　')) {
    const keyword = text.replace(/^検索[\s　]+/, '');
    await handleSearch(client, replyToken, keyword);
    return;
  }

  if (text.startsWith('削除 ') || text.startsWith('削除　')) {
    const supplierName = text.replace(/^削除[\s　]+/, '');
    await handleDelete(client, replyToken, supplierName);
    return;
  }

  if (text === '一覧') {
    await handleList(client, replyToken);
    return;
  }

  // 通常メッセージ → 価格表の転送として解析
  const messageId = event.message.id;
  const timestamp = new Date(event.timestamp).toISOString();

  const { supplierName, items } = parseMessage(text);

  if (!items.length) {
    await replyText(client, replyToken,
      '商品情報を検出できませんでした。\n\n以下の形式で転送してください:\n【仕入先名】\n商品名 価格円 数量個\n\n「ヘルプ」と送信で使い方を表示');
    return;
  }

  const name = supplierName || '不明な仕入先';
  const supplier = findOrCreateSupplier(name);

  // 同じ仕入先の古いデータを自動で非表示（入替）
  const deactivated = deactivateBySupplierId(supplier.id);

  insertProducts(messageId, supplier.id, items, timestamp);

  let reply = `${supplier.name} の価格表を更新しました\n`;
  if (deactivated.changes > 0) {
    reply += `(旧データ ${deactivated.changes}件 → 新データ ${items.length}件)\n`;
  } else {
    reply += `(${items.length}件 登録)\n`;
  }
  reply += '\n';
  for (const item of items.slice(0, 10)) {
    reply += `  ${item.productName}  ${item.price.toLocaleString()}円`;
    if (item.quantity) reply += `  ${item.quantity}個`;
    reply += '\n';
  }
  if (items.length > 10) {
    reply += `  ...他 ${items.length - 10}件`;
  }

  await replyText(client, replyToken, reply.trim());
  console.log(`Saved ${items.length} products from "${supplier.name}" (msg: ${messageId})`);
}

async function handleSearch(client, replyToken, keyword) {
  const result = getActiveProducts({ search: keyword, sortBy: 'price', sortOrder: 'asc', limit: 15, offset: 0 });

  if (!result.products.length) {
    await replyText(client, replyToken, `「${keyword}」に該当する商品は見つかりませんでした。`);
    return;
  }

  let text = `「${keyword}」の検索結果 (${result.total}件):\n\n`;
  for (const p of result.products) {
    text += `[${p.supplier_name}]\n`;
    text += `  ${p.product_name}  ${p.price.toLocaleString()}円`;
    if (p.quantity != null) text += `  ${p.quantity}個`;
    text += '\n';
  }
  if (result.total > 15) {
    text += `\n...他 ${result.total - 15}件（Webで確認）`;
  }

  await replyText(client, replyToken, text.trim());
}

async function handleDelete(client, replyToken, supplierName) {
  const suppliers = getAllSuppliers();
  const match = suppliers.find(s =>
    s.name === supplierName || s.aliases.includes(supplierName)
  );

  if (!match) {
    await replyText(client, replyToken, `仕入先「${supplierName}」が見つかりませんでした。\n「一覧」で仕入先名を確認してください。`);
    return;
  }

  const result = deactivateBySupplierId(match.id);
  await replyText(client, replyToken, `${match.name} の商品 ${result.changes}件を削除しました。`);
}

async function handleList(client, replyToken) {
  const suppliers = getAllSuppliers();
  if (!suppliers.length) {
    await replyText(client, replyToken, '登録されている仕入先はありません。');
    return;
  }

  let text = '登録仕入先一覧:\n\n';
  for (const s of suppliers) {
    const result = getActiveProducts({ supplierId: s.id, limit: 1, offset: 0 });
    text += `${s.name} (${result.total}件)\n`;
  }

  await replyText(client, replyToken, text.trim());
}

async function replyText(client, replyToken, text) {
  try {
    await client.replyMessage({
      replyToken,
      messages: [{ type: 'text', text }]
    });
  } catch (err) {
    console.error('Reply failed:', err.message);
  }
}

const HELP_TEXT = `【仕入価格表Bot 使い方】

■ 価格表の登録
グループの投稿をこのチャットに転送してください。
以下の形式を自動認識します:

【仕入先名】
商品名 価格円 数量個
商品名 価格円 数量個

※ 同じ仕入先の投稿は自動で上書きされます

■ コマンド
・検索 キーワード → 商品を検索
・削除 仕入先名 → 仕入先の全商品を削除
・一覧 → 仕入先と商品数を表示
・ヘルプ → この案内を表示`;
