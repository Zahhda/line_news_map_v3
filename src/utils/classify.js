// src/utils/classify.js

// Public categories
export const CATEGORIES = [
  'war','politics','economy','society','culture','climate','peace','demise','others'
];

/* ----------------------- Core signals (base model) ----------------------- */
const BASE_SIGNALS = {
  war: [
    'war','conflict','offensive','counteroffensive','front line','frontline','barrage',
    'missile','rocket','shelling','airstrike','air strike','drone strike','bomb','bombardment',
    'artillery','mortar','howitzer','tank','armored vehicle','infantry','brigade','battalion',
    'troop','troops','soldier','casualty','casualties','crossfire','sniper','incursion',
    'raid','invasion','clash','skirmish','hostilities','mobilization','conscription'
  ],
  politics: [
    'election','parliament','senate','cabinet','minister','policy','vote','campaign','coalition',
    'bill','mp','mla','president','pm','governor','assembly','party','lawmaker'
  ],
  economy: [
    'inflation','gdp','market','stocks','unemployment','trade','imports','exports','budget','deficit',
    'currency','interest rate','economy','economic','bond','equity','forex','commodity','manufacturing','fiscal'
  ],
  society: [
    'protest','education','healthcare','crime','community','social','welfare','migration','school',
    'university','hospital','poverty','turf war','gang','police','arrest','court','lawsuit'
  ],
  culture: [
    'festival','music','film','art','literature','heritage','museum','theatre','sport','celebration',
    'cultural','concert','exhibition','award','cinema','celebrity'
  ],
  climate: [
    'climate','flood','heatwave','drought','cyclone','hurricane','storm','wildfire','rainfall','monsoon',
    'earthquake','tsunami','weather','landslide','blizzard','typhoon'
  ],
  peace: [
    'ceasefire','truce','peace talk','peace talks','agreement','accord','deal','negotiation','mediation'
  ],
  demise: [
    'dies','death','passed away','obituary','killed','dead','fatal','mourns','condolence','perished'
  ]
};

// Strict war gating – nouns & verbs that indicate armed conflict.
const WAR_NOUNS = new Set([
  'missile','rocket','shell','airstrike','drone','bomb','artillery','mortar','howitzer','tank',
  'infantry','brigade','battalion','troop','soldier','casualty','sniper','incursion','raid',
  'invasion','skirmish','frontline','front','munition','armour','armored','barrage'
]);
const WAR_VERBS = new Set([
  'strike','strikes','struck','bomb','bombed','shell','shelled','shelling','hit','hits','attacked','attack',
  'invade','invaded','invades','raid','raided','clash','clashes','clashed','engage','engaged','engages'
]);

// Negative/figurative “war” patterns to EXCLUDE from war classification.
const WAR_FALSE_POS = [
  /\b(price|trade|rates?|discount|chip|talent|ratings|console|browser|format|patent|streaming)\s+war(s)?\b/i,
  /\bwar\s+of\s+words\b/i,
  /\b(word|twitter|hashtag|comment|online)\s+war\b/i,
  /\bstar[-\s]?wars?\b/i,
  /\bwarriors?\b/i,
  /\belection\s+war\b/i,
];

// If a sentence contains ceasefire/truce and lacks strong war cues → classify as peace.
const PEACE_DOMINANTS = /\b(cease[-\s]?fire|truce|peace\s+talks?|armistice|accord|agreement|mediation)\b/i;

/* ----------------------- Auto-learner (online) ----------------------- */
const LS_KEY = 'lnm_cls_v1';
let LEARNED = loadLearned();

function loadLearned(){
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{"tokenBoosts":{}}'); }
  catch { return { tokenBoosts:{} }; }
}
function saveLearned(){ try { localStorage.setItem(LS_KEY, JSON.stringify(LEARNED)); } catch {} }

// Adds per-token boosts for a label based on corrected text.
export function train(text, label){
  if (!text || !CATEGORIES.includes(label)) return;
  const toks = tokenize(text);
  for (const tok of toks){
    if (!tok) continue;
    const map = (LEARNED.tokenBoosts[tok] ||= {});
    map[label] = (map[label] || 0) + 1;
    // small negative pressure on competing labels to sharpen decision
    for (const c of CATEGORIES) if (c !== label) map[c] = (map[c] || 0) - 0.2;
  }
  saveLearned();
}

// Convenience for your item object {title, summary}
export function trainItem(it, label){
  train(`${it?.title || ''}. ${it?.summary || ''}`, label);
}

/* ----------------------- Tokenization & helpers ----------------------- */
function normalize(s=''){ return s.toLowerCase(); }
function tokenize(s=''){
  return normalize(s)
    .replace(/[^a-z0-9\s\-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}
function splitSentences(s=''){
  // Simple sentence splitter that also breaks on " — " and " • "
  return String(s).split(/(?<=[\.\?!…])\s+|[\u2014\-–]\s+| • /g).filter(Boolean);
}

// Mild negation detector near a keyword (e.g., "no missile", "without troops")
function isNegated(sentence, idxWindow){
  return /\b(no|not|without|deny|denies|denied|fake|hoax)\b/i.test(sentence);
}

/* ----------------------- Scoring ----------------------- */
function baseScores(text){
  const t = normalize(text);
  const scores = Object.fromEntries(CATEGORIES.map(c => [c, 0]));
  for (const [cat, list] of Object.entries(BASE_SIGNALS)) {
    for (const w of list) if (t.includes(w)) scores[cat] += 1;
  }
  return scores;
}

function applyLearnedBoosts(scores, text){
  const toks = tokenize(text);
  for (const tok of toks){
    const boosts = LEARNED.tokenBoosts[tok];
    if (!boosts) continue;
    for (const [cat, val] of Object.entries(boosts)){
      if (!scores[cat] && scores[cat] !== 0) continue;
      scores[cat] += val * 0.5; // gentle application
    }
  }
}

// Returns true iff the sentence is genuinely about armed conflict.
function isWarSentence(sentenceRaw){
  const sentence = normalize(sentenceRaw);

  // Exclude well-known figurative/metaphor/brand/team cases
  for (const rx of WAR_FALSE_POS) if (rx.test(sentence)) return false;

  // If it's primarily about ceasefire/truce and lacks strong war cues → treat as peace.
  const hasPeace = PEACE_DOMINANTS.test(sentence);

  // Quick exits: if no core conflict words at all, highly unlikely to be war.
  const hasWarWord = /\bwar|front\s?line|hostilities|conflict|offensive|counteroffensive\b/i.test(sentence);

  // Look for co-occurrence of military nouns and violent verbs.
  const toks = tokenize(sentence);
  let hasWarNoun = false, hasWarVerb = false;
  for (const tok of toks){
    if (WAR_NOUNS.has(tok)) hasWarNoun = true;
    if (WAR_VERBS.has(tok)) hasWarVerb = true;
  }

  // Also allow a strong core phrase match
  const strongPhrase = /\b(air\s?strike|drone\s?strike|shelling|artillery|missile\s+attack|rocket\s+attack|ground\s+incursion|crossfire|bombardment)\b/i.test(sentence);

  const strongWarCue = (hasWarNoun && hasWarVerb) || strongPhrase;

  if (hasPeace && !strongWarCue) return false; // peace-only sentence

  if (!strongWarCue){
    // If only "war" appears but none of the cues and not negated → likely figurative
    if (hasWarWord && !isNegated(sentence)) return false;
  }

  return strongWarCue || (hasWarWord && (hasWarNoun || hasWarVerb));
}

/* ----------------------- Public classification API ----------------------- */

// Classify a single sentence (returns best category + score map for debugging)
function classifySentence(sentence){
  const scores = baseScores(sentence);

  // Strict gate: WAR becomes 0 unless it's a real war sentence
  if (!isWarSentence(sentence)) scores.war = 0;

  // Ceasefire leaning to peace if no strong war cues
  if (PEACE_DOMINANTS.test(sentence) && scores.war < 1) scores.peace += 1.5;

  // Negation downweights
  if (isNegated(sentence)) {
    for (const c of CATEGORIES) scores[c] *= 0.9;
  }

  applyLearnedBoosts(scores, sentence);

  // Pick best
  let best = 'others', bestVal = -Infinity;
  for (const [k,v] of Object.entries(scores)) if (v > bestVal) { best = k; bestVal = v; }
  return { category: best, scores };
}

// Classify a full text (title + summary) by strongest sentence
export function classifyText(text){
  const sents = splitSentences(text);
  if (!sents.length) return 'others';
  let bestCat = 'others', bestVal = -Infinity;

  for (const sent of sents){
    const { category, scores } = classifySentence(sent);
    const v = scores[category] ?? 0;
    // Prefer war only if war truly wins that sentence
    if (v > bestVal || (v === bestVal && category === 'war')) {
      bestCat = category; bestVal = v;
    }
  }

  return bestCat;
}

// Convenience for item objects {title, summary}
export function classifyItem(it){
  return classifyText(`${it?.title || ''}. ${it?.summary || ''}`);
}

// Dominant category across a list
export function dominantCategory(items = []){
  const counts = Object.fromEntries(CATEGORIES.map(c => [c, 0]));
  for (const it of items){
    const cat = classifyItem(it);
    counts[cat] += 1;
  }
  return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'others';
}

/* ----------------------- Debug / utilities (optional) ----------------------- */
// If you want to inspect why something was/wasn't war:
// export function explain(text){
//   const out = [];
//   for (const s of splitSentences(text)){
//     const { category, scores } = classifySentence(s);
//     out.push({ sentence: s, category, scores });
//   }
//   return out;
// }
