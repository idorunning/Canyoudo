// Themed lexicons and the sentiment word lists for the perception analysis.
// Plain ESM, shared by the build/merge script and any agent tooling.
//
// THEMES — five curated topic lexicons. The build step counts, per facet/year,
// the items mentioning each theme and the rate per 10k tokens.
export const THEMES = {
  trust: [
    'trust', 'confidence', 'legitimacy', 'consent', 'faith', 'respect', 'reassurance',
    'transparency', 'accountability', 'integrity', 'public confidence',
  ],
  misconduct: [
    'misconduct', 'corruption', 'scandal', 'abuse', 'brutality', 'cover-up', 'coverup',
    'wrongdoing', 'malpractice', 'racist', 'misogyny', 'misogynistic', 'homophobic',
    'rape', 'rapist', 'assault', 'sacked', 'dismissed', 'gross misconduct', 'vetting',
    'predator', 'disgraced', 'lying', 'lied',
  ],
  reform: [
    'reform', 'review', 'overhaul', 'change', 'restructure', 'modernise', 'modernisation',
    'recommendation', 'recommendations', 'transformation', 'uplift', 'recruitment',
    'funding', 'cuts', 'austerity', 'inquiry', 'training', 'standards',
  ],
  race: [
    'race', 'racism', 'racist', 'institutional racism', 'ethnicity', 'ethnic', 'black',
    'minority', 'disproportionate', 'disproportionality', 'stop and search', 'discrimination',
    'profiling', 'macpherson', 'diversity',
  ],
  leadership: [
    'commissioner', 'chief constable', 'leadership', 'resign', 'resigned', 'resignation',
    'appointed', 'appointment', 'mayor', 'home secretary', 'oversight', 'command', 'chief',
  ],
};

export const THEME_KEYS = Object.keys(THEMES);

// POLICING VOCABULARY — the domain word-list that defines what "counts" as a
// word about policing. The cloud/race use an ALLOWLIST built from this plus the
// sentiment + theme lexicons, the curated entity/event/place names, so the only
// words shown are ones that say something about the police: operations, crime
// types, the justice process, oversight/reform, identity/equality, public
// trust, and ranks/roles. Everything else (generic nouns, procedural verbs,
// random personal names) is dropped automatically — no blocklist to chase.
// Natural surface forms; the builder folds each to its lemma too, so plurals/
// tenses match the lemmatised counts.
export const POLICING_TERMS = [
  // Operations & actions
  'arrest', 'detain', 'detention', 'custody', 'charge', 'charged', 'raid', 'raids', 'stop',
  'search', 'patrol', 'pursuit', 'chase', 'taser', 'baton', 'cordon', 'surveillance',
  'undercover', 'sting', 'crackdown', 'operation', 'swoop', 'manhunt', 'lockdown', 'curfew',
  'dispersal', 'restraint', 'handcuff', 'caution', 'summons', 'warrant', 'bail', 'remand',
  'deploy', 'deployment', 'response', 'seize', 'seizure', 'confiscate', 'spray', 'kettling',
  'firearms', 'armed', 'evict', 'eviction',
  // Crime types & harms
  'murder', 'manslaughter', 'homicide', 'rape', 'sexual', 'assault', 'robbery', 'burglary',
  'theft', 'shoplifting', 'fraud', 'scam', 'terror', 'terrorism', 'terrorist', 'extremism',
  'knife', 'knives', 'gun', 'firearm', 'weapon', 'drug', 'drugs', 'cannabis', 'cocaine',
  'heroin', 'gang', 'gangs', 'trafficking', 'smuggling', 'grooming', 'abuse', 'stalking',
  'harassment', 'kidnap', 'abduction', 'arson', 'looting', 'riot', 'riots', 'disorder',
  'violence', 'violent', 'attack', 'stabbing', 'stab', 'stabbed', 'shooting', 'shoot', 'shot',
  'killing', 'kill', 'killed', 'death', 'deaths', 'fatal', 'injury', 'wounding', 'hate',
  'domestic', 'exploitation', 'slavery', 'paedophile', 'predator', 'rapist', 'killer',
  'offender', 'suspect', 'criminal', 'perpetrator', 'victim', 'victims', 'fugitive', 'gunman',
  'crime', 'crimes', 'criminals', 'knifepoint', 'mugging', 'carjacking',
  // Justice process
  'court', 'trial', 'jury', 'judge', 'magistrate', 'crown', 'verdict', 'sentence', 'sentencing',
  'conviction', 'convicted', 'acquit', 'acquitted', 'jail', 'jailed', 'prison', 'imprisonment',
  'prosecution', 'prosecute', 'prosecuted', 'plea', 'guilty', 'innocent', 'evidence', 'witness',
  'testimony', 'appeal', 'inquest', 'coroner', 'tribunal', 'hearing', 'defendant', 'cps',
  // Oversight, reform, accountability
  'inquiry', 'review', 'watchdog', 'ipcc', 'iopc', 'misconduct', 'corruption', 'corrupt',
  'vetting', 'discipline', 'disciplinary', 'dismissal', 'dismissed', 'sacked', 'sacking',
  'complaint', 'complaints', 'accountability', 'reform', 'scandal', 'cover-up', 'coverup',
  'whistleblower', 'inspectorate', 'inspection', 'standards', 'training', 'recruitment',
  'uplift', 'cuts', 'austerity', 'funding', 'budget', 'shortage', 'morale', 'failure',
  'failing', 'failings', 'blunder', 'apology', 'resign', 'resignation', 'probe',
  // Groups, identity, equality
  'race', 'racism', 'racist', 'ethnic', 'ethnicity', 'black', 'asian', 'minority', 'bame',
  'disproportionate', 'discrimination', 'profiling', 'diversity', 'women', 'woman', 'misogyny',
  'misogynistic', 'sexism', 'homophobic', 'transphobic', 'disabled', 'disability', 'muslim',
  'immigrant', 'immigration', 'asylum', 'migrant', 'refugee', 'youth', 'child', 'children',
  'teenager', 'vulnerable', 'mental',
  // Trust, perception, public response
  'trust', 'distrust', 'mistrust', 'confidence', 'legitimacy', 'consent', 'faith', 'respect',
  'reassurance', 'transparency', 'integrity', 'suspicion', 'fear', 'safety', 'unsafe',
  'community', 'public', 'outrage', 'anger', 'protest', 'protests', 'protester', 'demonstration',
  'march', 'vigil', 'rally', 'backlash', 'criticism', 'scrutiny', 'controversy',
  // Ranks, roles, institutions (force/constable/officer are domain-stopped)
  'detective', 'inspector', 'superintendent', 'chief', 'commissioner', 'copper', 'bobby',
  'beat', 'squad', 'federation', 'college', 'taskforce',
  // Era topics / named events that recur
  'covid', 'coronavirus', 'pandemic', 'brexit', 'olympic', 'olympics', 'g20', 'windrush',
  'grenfell', 'hillsborough', 'macpherson', 'leveson', 'partygate', 'plebgate', 'soham',
  'stockwell', 'extinction', 'rebellion', 'climate', 'austerity',
];

// SENTIMENT — lightweight AFINN-style polarity lists scoped to how the press
// writes about policing. Used to score the tone of matched items toward the
// police. Not a substitute for a full sentiment model; the GDELT tone field is
// stored separately as a cross-check.
export const POSITIVE = new Set([
  'praise', 'praised', 'hailed', 'success', 'successful', 'effective', 'reassuring', 'trusted',
  'brave', 'bravery', 'hero', 'heroic', 'dedicated', 'professional', 'improvement', 'improved',
  'reform', 'progress', 'thanked', 'commended', 'award', 'protect', 'protected', 'safer', 'safety',
  'rescue', 'rescued', 'support', 'supported', 'community', 'confidence', 'restored',
]);

export const NEGATIVE = new Set([
  'failure', 'failed', 'failings', 'scandal', 'corruption', 'misconduct', 'brutality', 'abuse',
  'racist', 'racism', 'misogyny', 'misogynistic', 'homophobic', 'rape', 'rapist', 'murder', 'killed',
  'shooting', 'shot', 'cover-up', 'coverup', 'disgraced', 'sacked', 'resign', 'resigned', 'crisis',
  'incompetence', 'incompetent', 'distrust', 'mistrust', 'outrage', 'condemned', 'criticised',
  'criticism', 'blunder', 'apology', 'apologise', 'apologised', 'predator', 'lied', 'lying', 'shame',
  'shameful', 'controversy', 'controversial', 'broken', 'discredited',
]);
