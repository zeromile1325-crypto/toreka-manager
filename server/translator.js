/**
 * Translation helper for product names
 * Uses google-translate-api-x (free, no API key)
 */

let translate;

async function getTranslator() {
  if (!translate) {
    try {
      const mod = await import('google-translate-api-x');
      translate = mod.default || mod;
    } catch (e) {
      console.error('Translation module not available:', e.message);
      return null;
    }
  }
  return translate;
}

// Common TCG term dictionary (pre-translate for accuracy)
const TCG_DICT = {
  'シュリンク付き': 'Shrink-wrapped',
  'シュリンク': 'Shrink-wrapped',
  'カートン': 'Carton',
  '在庫': 'Stock',
  '被り無し': 'No duplicates',
  'BOX': 'BOX',
  'box': 'BOX',
  'ボックス': 'BOX',
  'パック': 'Pack',
  'セット': 'Set',
  'スペシャル': 'Special',
  'カードセット': 'Card Set',
  '蔵出し': 'Warehouse Sale',
  '少量限定': 'Limited Quantity',
};

export async function translateToEnglish(japaneseName) {
  if (!japaneseName) return '';

  // Apply dictionary first
  let name = japaneseName;
  for (const [jp, en] of Object.entries(TCG_DICT)) {
    name = name.replace(new RegExp(jp, 'gi'), en);
  }

  // If already mostly English/numbers, return as-is
  if (/^[a-zA-Z0-9\s\-_.,'()@#&+]+$/.test(name)) {
    return name;
  }

  const t = await getTranslator();
  if (!t) return name; // fallback: return dict-applied name

  try {
    const result = await t(name, { from: 'ja', to: 'en' });
    return result.text || name;
  } catch (err) {
    console.error('Translation failed:', err.message);
    return name;
  }
}

export async function batchTranslate(items) {
  const results = [];
  for (const item of items) {
    const english = await translateToEnglish(item.product_name);
    results.push({ id: item.id, englishName: english });
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 200));
  }
  return results;
}
