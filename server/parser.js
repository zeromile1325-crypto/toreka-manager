/**
 * LINE メッセージパーサー
 * 仕入先の投稿テキストから仕入先名・商品名・価格・数量を抽出する
 */

/**
 * メッセージ全体を解析して仕入先名と商品リストを返す
 * @param {string} text - LINEメッセージのテキスト
 * @returns {{ supplierName: string|null, items: Array<{productName: string, price: number, quantity: number|null}> }}
 */
export function parseMessage(text) {
  if (!text || typeof text !== 'string') {
    return { supplierName: null, items: [] };
  }

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let supplierName = null;
  const items = [];

  for (const line of lines) {
    // 仕入先名を抽出: 【...】 or ［...］ or [...] (全角/半角)
    const supplierMatch = line.match(/^[【\[［](.+?)[】\]］]$/);
    if (supplierMatch) {
      supplierName = supplierMatch[1].trim();
      continue;
    }

    // 商品行を解析
    const item = parseProductLine(line);
    if (item) {
      items.push(item);
    }
  }

  return { supplierName, items };
}

/**
 * 1行から商品名・価格・数量を抽出
 * 対応フォーマット例:
 *   ポケカ ピカチュウ 3000円 10個
 *   ポケカ ピカチュウ ¥3,000 x10
 *   ピカチュウ 3000 10個
 */
function parseProductLine(line) {
  // 価格パターン: ¥3,000 / 3000円 / 3,000円 / ￥3000
  const pricePattern = /[¥￥]?\s*([\d,]+)\s*円?/;
  const priceMatch = line.match(pricePattern);
  if (!priceMatch) return null;

  const price = parseInt(priceMatch[1].replace(/,/g, ''), 10);
  if (isNaN(price) || price <= 0) return null;

  // 数量パターン: 10個 / 10枚 / 10セット / x10 / ×10
  const quantityPattern = /(\d+)\s*[個枚セットパック箱]+|[x×]\s*(\d+)/i;
  const quantityMatch = line.match(quantityPattern);
  const quantity = quantityMatch
    ? parseInt(quantityMatch[1] || quantityMatch[2], 10)
    : null;

  // 商品名 = 価格・数量部分を除いた残り
  let productName = line;
  // 数量部分を除去 (must come before price removal since "10個" contains digits)
  productName = productName.replace(/\d+\s*[個枚セットパック箱]+/g, '');
  productName = productName.replace(/[x×]\s*\d+/gi, '');
  // 価格部分を除去
  productName = productName.replace(/[¥￥]\s*[\d,]+/g, '');
  productName = productName.replace(/[\d,]+\s*円/g, '');
  // 残った単位文字を除去
  productName = productName.replace(/[個枚箱]+/g, '');
  // クリーンアップ
  productName = productName.replace(/\s+/g, ' ').trim();

  if (!productName) return null;

  return { productName, price, quantity };
}
