/**
 * LINE メッセージパーサー
 * 仕入先の投稿テキストから仕入先名・商品名・価格・数量を抽出する
 *
 * 対応フォーマット:
 *   パターンA: 商品名 / 補足 / 価格円 在庫N
 *   パターンB: 商品名 / 数量@価格
 *   パターンC: 商品名 / 数量 価格
 */

// フッター・業務情報を除外するパターン
const IGNORE_PATTERNS = [
  /^※/,
  /^・/,
  /^◆/,
  /遠絡請求/,
  /請求書発行/,
  /転送サービス/,
  /転送\d+梱包/,
  /国内発送/,
  /国内送料/,
  /国内着払/,
  /海外発送/,
  /送料別/,
  /着払い/,
  /発送元/,
  /仕入れ?元/,
  /出荷$/,
  /キャンセル/,
  /個人LINE/,
  /メンバー/,
  /お疲れ様/,
  /お世話になっ/,
  /ご提案/,
  /下記残商品/,
  /蔵出し/,
  /少量限定/,
  /在庫商品の為/,
  /ご入用/,
  /初めての方/,
  /カートンラベル/,
  /運送会社/,
  /責任を負/,
  /問屋/,
  /カドショ/,
  /買取品/,
  /入荷日/,
  /グループライン/,
];

function isIgnoredLine(line) {
  return IGNORE_PATTERNS.some(p => p.test(line));
}

/**
 * メッセージ全体を解析して仕入先名と商品リストを返す
 */
export function parseMessage(text) {
  if (!text || typeof text !== 'string') {
    return { supplierName: null, items: [] };
  }

  // 仕入先名を抽出: 【...】 or ［...］ or [...]
  let supplierName = null;
  const supplierMatch = text.match(/[【\[［](.+?)[】\]］]/);
  if (supplierMatch) {
    supplierName = supplierMatch[1].trim();
  }

  // 空行でブロックに分割
  const blocks = text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  const items = [];

  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    // ブロック内の全行がフッターなら無視
    if (lines.every(l => isIgnoredLine(l))) continue;

    // ブロックから商品情報を抽出
    const extracted = extractFromBlock(lines);
    if (extracted) {
      items.push(...extracted);
    }
  }

  return { supplierName, items };
}

/**
 * 1ブロック（空行で区切られた行群）から商品情報を抽出
 */
function extractFromBlock(lines) {
  // フッター行を除外
  const cleanLines = lines.filter(l => !isIgnoredLine(l));
  if (!cleanLines.length) return null;

  // 常に複数行パターンで解析（商品名+価格行のペアを探す）
  const multi = parseMultiLine(cleanLines);
  if (multi) return multi;

  return null;
}

/**
 * 1行完結の商品行を解析
 * 例: "10,700円 在庫100"  "1カートン@700,000"  "1case 166,000"  "10セット@24,500"
 */
function parseSingleLine(line) {
  // パターンB: 数量+単位@価格 (例: 1カートン@700,000 / 25BOX@23,500 / 10セット@24,500)
  const atPattern = /^(.+?)@\s*([\d,]+)/;
  const atMatch = line.match(atPattern);
  if (atMatch) {
    const qtyPart = atMatch[1].trim();
    const price = parseInt(atMatch[2].replace(/,/g, ''), 10);
    if (price > 0) {
      const qty = extractQuantity(qtyPart);
      return { productName: '', price, quantity: qty, _qtyLabel: qtyPart };
    }
  }

  // パターンC: 数量 価格 (例: 1case 166,000 / 1 case 119,000)
  const casePattern = /^(\d+)\s*cases?\s+([\d,]+)$/i;
  const caseMatch = line.match(casePattern);
  if (caseMatch) {
    const qty = parseInt(caseMatch[1], 10);
    const price = parseInt(caseMatch[2].replace(/,/g, ''), 10);
    if (price > 0) {
      return { productName: '', price, quantity: qty, _qtyLabel: `${qty}case` };
    }
  }

  // パターンA: 価格円 在庫N (例: 10,700円 在庫100)
  const stockPattern = /^([\d,]+)\s*円\s*在庫\s*(\d+)/;
  const stockMatch = line.match(stockPattern);
  if (stockMatch) {
    const price = parseInt(stockMatch[1].replace(/,/g, ''), 10);
    const qty = parseInt(stockMatch[2], 10);
    if (price > 0) {
      return { productName: '', price, quantity: qty };
    }
  }

  // パターンA2: 価格円のみ (例: 2,000円)
  const priceOnlyPattern = /^([\d,]+)\s*円\s*$/;
  const priceOnlyMatch = line.match(priceOnlyPattern);
  if (priceOnlyMatch) {
    const price = parseInt(priceOnlyMatch[1].replace(/,/g, ''), 10);
    if (price > 0) {
      return { productName: '', price, quantity: null };
    }
  }

  return null;
}

/**
 * 複数行にまたがる商品情報を解析
 * 例:
 *   ニンジャスピナー      ← 商品名
 *   シュリンク付き        ← 補足
 *   10,700円 在庫100     ← 価格行
 *
 *   151                  ← 商品名
 *   1カートン@700,000    ← 価格行
 */
function parseMultiLine(lines) {
  if (!lines.length) return null;

  // 最後の行が価格行かチェック
  const lastLine = lines[lines.length - 1];
  const priceInfo = parseSingleLine(lastLine);

  if (priceInfo && lines.length >= 2) {
    // 価格行より前が商品名（複数行を結合）
    const nameLines = lines.slice(0, -1).filter(l => !isIgnoredLine(l));
    const productName = nameLines.join(' ').trim();
    if (productName) {
      priceInfo.productName = productName;
      return [priceInfo];
    }
  }

  // 商品名行 + 価格行が交互に並ぶパターン
  // 例: "OP-15" / "1case 166,000" / "EB-04" / "1 case 119,000"
  const items = [];
  let currentName = [];

  for (const line of lines) {
    const info = parseSingleLine(line);
    if (info) {
      // 価格行 → 蓄積された商品名を結合
      info.productName = currentName.join(' ').trim() || info._qtyLabel || '';
      delete info._qtyLabel;
      if (info.productName || info.price > 0) {
        items.push(info);
      }
      currentName = [];
    } else {
      // 商品名行
      currentName.push(line);
    }
  }

  return items.length > 0 ? items : null;
}

/**
 * 数量部分から数値を抽出
 * "1カートン" → 1, "25BOX" → 25, "100枚" → 100, "10セット" → 10
 */
function extractQuantity(text) {
  const m = text.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}
