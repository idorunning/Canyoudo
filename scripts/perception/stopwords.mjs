// Stopwords for the perception word-frequency analysis. Two lists:
//   • STOPWORDS — common English function words, dropped from the cloud.
//   • DOMAIN_STOP — words that are definitionally present in this corpus
//     ("police", "policing", …). They are dropped from the FREQUENCY CLOUD so it
//     surfaces what is being said *about* the police, but they are still counted
//     toward corpusTokens so rates stay comparable.
// Plain ESM so the build script and any agent tooling share one list.

export const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'else', 'when', 'while', 'of', 'to', 'in', 'on', 'at',
  'by', 'for', 'with', 'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after', 'above',
  'below', 'from', 'up', 'down', 'out', 'off', 'over', 'under', 'again', 'further', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing', 'would', 'should', 'could',
  'ought', 'will', 'shall', 'can', 'may', 'might', 'must', 'this', 'that', 'these', 'those', 'i', 'you', 'he',
  'she', 'it', 'we', 'they', 'them', 'their', 'his', 'her', 'its', 'our', 'your', 'my', 'me', 'him', 'us',
  'who', 'whom', 'which', 'what', 'whose', 'as', 'so', 'than', 'too', 'very', 'just', 'now', 'also', 'not',
  'no', 'nor', 'only', 'own', 'same', 'such', 'there', 'here', 'all', 'any', 'both', 'each', 'few', 'more',
  'most', 'other', 'some', 'how', 'why', 'where', 'said', 'says', 'told', 'mr', 'mrs', 'ms', 'one', 'two',
  'last', 'year', 'years', 'week', 'day', 'new', 'old', 'first', 'people', 'man', 'woman', 'time', 'made',
  'make', 'take', 'taken', 'get', 'got', 'go', 'going', 'come', 'came', 'see', 'seen', 'way', 'back',
]);

export const DOMAIN_STOP = new Set([
  'police', 'policing', 'officer', 'officers', 'constable', 'constables', 'force', 'forces', 'constabulary',
]);

// Low-signal/noise words that survive stopwording but say nothing about the
// police (procedural verbs, vague fillers). Dropped from the cloud/race so only
// meaningful vocabulary shows. (e.g. "file", "say", "amid".)
export const HIDE_WORDS = new Set([
  'file', 'say', 'happen', 'amid', 'set', 'bid', 'due', 'ago', 'yet', 'via', 'per',
  'lot', 'top', 'big', 'hit', 'put', 'tell', 'told', 'claim', 'reveal', 'face',
  // Tabloid filler verbs/vague nouns — no perception signal.
  'fume', 'unveil', 'reject', 'pledge', 'beat', 'plan', 'power',
  // More generic news verbs/nouns and fragments that carry no policing meaning
  // (surfaced by reviewing the real per-year clouds): "police warn/report/tackle…".
  'warn', 'report', 'tackle', 'ban', 'call', 'test', 'track', 'battle', 'win',
  'quit', 'row', 'contract', 'light', 'red', 'anti', 'unveil', 'support', 'deal',
  // Bare quantities/measures.
  'number', 'five', 'hour',
  // Pure party-politics names (not about policing): MPs, Home/Foreign-office
  // politicians and PMs whose mentions are about Westminster, not the police.
  'tory', 'hague', 'widdecombe', 'boris', 'bori', 'johnson',
  'mps', 'straw', 'clarke', 'hunt', 'cameron', 'theresa', 'minister', 'tories',
  // Weak tokens that leak in when multi-word theme phrases are split
  // ("home secretary" → home/secretary): not meaningful on their own.
  'home', 'secretary',
  // Generic rank/budget/action and vague nouns — present but say little about how
  // the police are perceived; removed on review (chief, cut, stop, …).
  'chief', 'cut', 'stop', 'public', 'community', 'britain', 'appeal', 'beat',
  'response', 'deploy', 'deployment', 'squad', 'unit', 'standards',
  // Lone first names — meaning is carried by the surname's full-name display
  // below, so the bare first name is dropped to avoid double-counting a person.
  'ian', 'sarah', 'mark', 'david', 'cressida',
]);

// Display casing for words the lemmatiser lower-cases or folds — acronyms and
// proper nouns — so the cloud reads correctly ("met"→"MET", "hague"→"Hague").
// Keys are the FOLDED forms that actually appear (the lemmatiser strips a
// trailing "s", so e.g. "couzens"→"couzen", "menezes"→"meneze").
export const WORD_DISPLAY = {
  // Acronyms / institutions.
  met: 'MET', cps: 'CPS', iopc: 'IOPC', ipcc: 'IPCC', psni: 'PSNI', gmp: 'GMP',
  pcc: 'PCC', pcso: 'PCSO', vawg: 'VAWG', bame: 'BAME', uk: 'UK', eu: 'EU',
  nhs: 'NHS', dna: 'DNA', ira: 'IRA', g20: 'G20', taser: 'Taser',
  // Places.
  london: 'London', britain: 'Britain', scotland: 'Scotland', wales: 'Wales',
  manchester: 'Manchester', yorkshire: 'Yorkshire', merseyside: 'Merseyside',
  westminster: 'Westminster', wiltshire: 'Wiltshire',
  // Events / inquiries.
  windrush: 'Windrush', grenfell: 'Grenfell', hillsborough: 'Hillsborough',
  macpherson: 'Macpherson', leveson: 'Leveson', partygate: 'Partygate',
  // People — the full name shows on the SURNAME; the bare first name is in
  // HIDE_WORDS, so each person is counted once (no first+last double count).
  everard: 'Sarah Everard', duggan: 'Mark Duggan', lawrence: 'Stephen Lawrence',
  blair: 'Ian Blair', tomlinson: 'Ian Tomlinson', carrick: 'David Carrick',
  couzen: 'Couzens', couzens: 'Couzens', meneze: 'de Menezes', menezes: 'de Menezes',
  casey: 'Casey', rowley: 'Rowley', dick: 'Cressida Dick', stephenson: 'Stephenson',
  blunkett: 'Blunkett', child: 'Child',
  // Folding mangles in the already-committed data (lemma() now prevents new ones).
  coronaviru: 'coronavirus', clashe: 'clashes', christma: 'Christmas',
  cannabi: 'Cannabis', crisi: 'Crisis', campu: 'Campus', statu: 'Statue', wale: 'Wales',
};

// Drop a token from the frequency cloud? (Stopword, domain word, noise word,
// very short, or purely numeric.) Counting toward corpusTokens is decided
// separately.
export function isCloudStop(token) {
  if (token.length < 3) return true;
  if (/^\d+$/.test(token)) return true;
  if (STOPWORDS.has(token)) return true;
  if (DOMAIN_STOP.has(token)) return true;
  if (HIDE_WORDS.has(token)) return true;
  return false;
}
