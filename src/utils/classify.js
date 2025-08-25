// src/utils/classify.js
export const CATEGORIES = ['war','politics','economy','society','culture','climate','peace','demise','others'];

const SIGNALS = {
  war: ['war','attack','missile','shelling','airstrike','drone','bomb','frontline','troop','ceasefire','fighter jet','invasion','artillery','clash','strike'],
  politics: ['election','parliament','senate','cabinet','minister','policy','vote','campaign','coalition','bill','mp','mla','president','pm','governor','assembly'],
  economy: ['inflation','gdp','market','stocks','unemployment','trade','imports','exports','budget','deficit','currency','interest rate','economy','economic'],
  society: ['protest','education','healthcare','crime','community','social','welfare','migration','school','university','hospital','poverty'],
  culture: ['festival','music','film','art','literature','heritage','museum','theatre','sport','celebration','cultural'],
  climate: ['climate','flood','heatwave','drought','cyclone','hurricane','storm','wildfire','rainfall','monsoon','earthquake','tsunami','weather'],
  peace: ['ceasefire','peace talk','agreement','truce','deal','accord'],
  demise: ['dies','death','passed away','obituary','killed','dead','fatal','mourns','condolence']
};

function score(text) {
  const t = (text || '').toLowerCase();
  const scores = Object.fromEntries(CATEGORIES.map(c => [c, 0]));
  for (const [cat, list] of Object.entries(SIGNALS)) {
    for (const w of list) if (t.includes(w)) scores[cat] += 1;
  }
  return scores;
}

export function classifyText(text) {
  const s = score(text);
  let best = 'others', bestVal = -1;
  for (const [k,v] of Object.entries(s)) if (v > bestVal) { best = k; bestVal = v; }
  return best;
}

export function dominantCategory(items = []) {
  const counts = Object.fromEntries(CATEGORIES.map(c => [c, 0]));
  for (const it of items) counts[classifyText(`${it.title} ${it.summary}`)]++;
  return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'others';
}
