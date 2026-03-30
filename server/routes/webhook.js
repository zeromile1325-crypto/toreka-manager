import { Router } from 'express';
import { middleware, messagingApi } from '@line/bot-sdk';
import { parseMessage } from '../parser.js';
import { findOrCreateSupplier, insertProducts, deactivateBySupplierId, getAllSuppliers, getActiveProducts } from '../db.js';

// ユーザーごとに「次に使う仕入先名」を記憶
const pendingSupplier = {};

export default function createWebhookRouter(config) {
  const router = Router();

  const client = new messagingApi.MessagingApiClient({
    channelAccessToken: config.channelAccessToken
  });

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
  const userId = event.source.userId || 'unknown';

  // コマンド処理
  if (text === 'ヘルプ' || text === 'help') {
    await replyText(client, replyToken, HELP_TEXT);
    return;
  }
  if (text.startsWith('検索 ') || text.startsWith('検索　')) {
    await handleSearch(client, replyToken, text.replace(/^検索[\s　]+/, ''));
    return;
  }
  if (text.startsWith('削除 ') || text.startsWith('削除　')) {
    await handleDelete(client, replyToken, text.replace(/^削除[\s　]+/, ''));
    return;
  }
  if (text === '一覧') {
    await handleList(client, replyToken);
    return;
  }

  // 価格表の解析を試みる
  const { supplierName, items } = parseMessage(text);

  if (items.length > 0) {
    // 商品が検出された → 価格表として登録
    // 仕入先名の優先順位: メッセージ内【】 > 事前指定 > 不明
    const name = supplierName || pendingSupplier[userId] || '不明な仕入先';
    const supplier = findOrCreateSupplier(name);

    const deactivated = deactivateBySupplierId(supplier.id);
    const messageId = event.message.id;
    const timestamp = new Date(event.timestamp).toISOString();
    insertProducts(messageId, supplier.id, items, timestamp);

    // 使用後にクリア
    delete pendingSupplier[userId];

    let reply = `✅ ${supplier.name} の価格表を更新しました\n`;
    if (deactivated.changes > 0) {
      reply += `(旧${deactivated.changes}件 → 新${items.length}件)\n`;
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
    console.log(`Saved ${items.length} products from "${supplier.name}"`);
    return;
  }

  // 商品が検出されなかった → 仕入先名の事前指定かもしれない
  // 短いテキスト（20文字以下）で、コマンドでなければ仕入先名として記憶
  if (text.length <= 20 && !text.includes('\n')) {
    pendingSupplier[userId] = text;
    await replyText(client, replyToken,
      `📝 仕入先「${text}」を記憶しました。\n次に転送する価格表は「${text}」として登録します。`);
    return;
  }

  await replyText(client, replyToken,
    '商品情報を検出できませんでした。\n\n使い方:\n1. まず仕入先名を送信\n2. 次に価格表を転送\n\n「ヘルプ」で詳細表示');
}

async function handleSearch(client, replyToken, keyword) {
  const result = getActiveProducts({ search: keyword, sortBy: 'price', sortOrder: 'asc', limit: 15, offset: 0 });
  if (!result.products.length) {
    await replyText(client, replyToken, `「${keyword}」に該当する商品は見つかりませんでした。`);
    return;
  }
  let text = `「${keyword}」の検索結果 (${result.total}件):\n\n`;
  for (const p of result.products) {
    text += `[${p.supplier_name}]\n  ${p.product_name}  ${p.price.toLocaleString()}円`;
    if (p.quantity != null) text += `  ${p.quantity}個`;
    text += '\n';
  }
  if (result.total > 15) text += `\n...他 ${result.total - 15}件（Webで確認）`;
  await replyText(client, replyToken, text.trim());
}

async function handleDelete(client, replyToken, supplierName) {
  const suppliers = getAllSuppliers();
  const match = suppliers.find(s => s.name === supplierName || s.aliases.includes(supplierName));
  if (!match) {
    await replyText(client, replyToken, `仕入先「${supplierName}」が見つかりませんでした。\n「一覧」で確認してください。`);
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
    await client.replyMessage({ replyToken, messages: [{ type: 'text', text }] });
  } catch (err) {
    console.error('Reply failed:', err.message);
  }
}

const HELP_TEXT = `【仕入価格表Bot 使い方】

■ 価格表の登録（2ステップ）
1. 仕入先名を送信（例: 平田光希）
   → 「記憶しました」と返信
2. グループの価格表を転送
   → 自動解析して登録

※ 【仕入先名】付きなら1回で登録可
※ 同じ仕入先は自動で上書き

■ コマンド
・検索 キーワード → 商品を検索
・削除 仕入先名 → 全商品を削除
・一覧 → 仕入先と商品数
・ヘルプ → この案内`;
