/**
 * Auto-categorize trading card products by keyword detection
 */

const POKEMON_KEYWORDS = [
  'ポケカ', 'ポケモン', 'pokemon', 'pikachu', 'リザードン', 'ピカチュウ',
  'ミュウ', 'ゲンガー', 'メガエルレイド', 'バイオレット', 'スカーレット',
  'ニンジャスピナー', 'メガシンフォニア', 'メガブレイブ', 'クレイバースト',
  '151', 'SV', 'sv1', 'sv2', 'sv3', 'sv4', 'sv5', 'sv6', 'sv7', 'sv8',
];

const ONEPIECE_KEYWORDS = [
  'ワンピース', 'ワンピ', 'ONE PIECE', 'onepiece', 'ルフィ',
  'OP-', 'OP0', 'EB-', 'EB0',
];

export function detectCategory(productName) {
  const name = (productName || '').toLowerCase();

  for (const kw of POKEMON_KEYWORDS) {
    if (name.includes(kw.toLowerCase())) return 'pokemon';
  }
  for (const kw of ONEPIECE_KEYWORDS) {
    if (name.includes(kw.toLowerCase())) return 'onepiece';
  }
  return 'others';
}
