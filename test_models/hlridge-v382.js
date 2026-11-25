// hlridge-v382 — Blissymbolics decode prompt template.
//
// A test_models template object: { name, systemPrompt, build(context) }.
//   • build(context) returns the per-target user-prompt string.
//   • systemPrompt is the constant system message.
//   • Expects the same context object buildContext() provides (spelling, charCount,
//     subwords[].helpers[], indicators[], modifiers[], neighbours{sharedStart,sharedEnd},
//     legend[]). The non-destructive normalizeContext() below fills a few field aliases
//     (e.g. baseSpelling from notation/spelling) so it tolerates minor field-name
//     differences; it never overwrites a field you provide. If a rendered prompt shows the
//     literal "undefined", ping hlridge — a field name drifted and it's a one-line fix.
//
// Registered in prompt_templates.js:  import hlridgeV382 from "./hlridge-v382.js";

const header = (context) =>
  `Spelling: ${context.spelling}  (${context.charCount} character${context.charCount === 1 ? '' : 's'})`;

const glossesOf = (helpers, max = 6) =>
  helpers.map((h) => h.gloss).filter(Boolean).slice(0, max).join(' | ');

const subwordLines = (context) =>
  [...context.subwords]
    .sort((a, b) => b.length - a.length)
    .map((s) => ({ baseSpelling: s.baseSpelling, glosses: glossesOf(s.helpers) }))
    .filter((s) => s.glosses)
    .map((s) => `  ${s.baseSpelling}: ${s.glosses}`);

const POS_LABEL = { noun: 'noun', description: 'adjective', action: 'verb', expression: 'marker' };
const IND_LABEL = {
  'INDICATOR THING': 'concrete',
  'INDICATOR DESCRIPTION': 'adjective',
  'INDICATOR DESCRIPTION AFTER THE FACT': 'adjective',
  'INDICATOR ACTION': 'verb',
};
const senseLabel = (helper) => {
  const ind = (helper.indicators || [])[0];
  return (ind && IND_LABEL[ind.name]) || POS_LABEL[helper.pos] || helper.pos || '';
};

const helperMatchesTarget = (helper, subword, targetIndicators) => {
  const hInds = new Set((helper.indicators || []).map((i) => i.spelling));
  if (!hInds.size) return false;
  const [start, end] = subword.span || [0, 0];
  return (targetIndicators || []).some(
    (ti) => ti.characterIndex >= start && ti.characterIndex < end && hInds.has(ti.spelling)
  );
};

const subwordSenseLines = (context) => {
  const targetIndicators = context.indicators || [];
  const lines = [];
  for (const s of [...context.subwords].sort((a, b) => b.length - a.length)) {
    const helpers = (s.helpers || []).filter((h) => h.gloss);
    if (!helpers.length) continue;
    const w = Math.max(...helpers.map((h) => (h.spelling || '').length));
    lines.push(`  ${s.baseSpelling}:`);
    for (const h of helpers) {
      const flag = helperMatchesTarget(h, s, targetIndicators) ? "   ← matches this word's indicator" : '';
      lines.push(`    ${(h.spelling || '').padEnd(w)}  ${senseLabel(h).padEnd(9)} — ${h.gloss}${flag}`);
    }
  }
  return lines;
};

const GROUP_READS_AS = { Adjectival: 'an adjective/adverb', Verbal: 'a verb', Nominal: 'a concrete noun' };
const grammarSummary = (context) => {
  const inds = context.indicators || [];
  if (!inds.length) return null;
  const reads = [...new Set(inds.map((i) => GROUP_READS_AS[i.group] || i.purpose || i.name))];
  return `This word is marked as ${reads.join(' + ')} — read the answer in that grammatical form.`;
};

const modifierLines = (context) => {
  const mods = context.modifiers || [];
  const w = mods.length ? Math.max(...mods.map((m) => (m.spelling || '').length)) : 0;
  return mods.map((m) => {
    const name = (m.asPrefix || []).join(' / ') || m.gloss || m.spelling;
    const effect = m.gloss && m.gloss !== name ? ` — ${m.gloss}` : '';
    return `  ${(m.spelling || '').padEnd(w)}  ${name}${effect}`;
  });
};

const indicatorLines = (context) => {
  const inds = context.indicators || [];
  const glyphs = (context.baseSpelling || context.spelling || '').split('/');
  const w = inds.length ? Math.max(...inds.map((i) => (i.spelling || '').length)) : 0;
  return inds.map((i) => {
    const glyph = glyphs[i.characterIndex];
    const where = glyph ? `on ${glyph}` : 'whole word';
    const effect = i.purpose ? i.purpose.charAt(0).toLowerCase() + i.purpose.slice(1) : i.name || '';
    return `  ${(i.spelling || '').padEnd(w)}  ${where} — ${effect}`;
  });
};

const allIndicators = (context) => {
  const seen = new Map();
  const add = (list) => (list || []).forEach((i) => {
    const code = i.spelling || i.code;
    if (code && !seen.has(code)) seen.set(code, i);
  });
  add(context.indicators);
  (context.subwords || []).forEach((s) => (s.helpers || []).forEach((h) => add(h.indicators)));
  add(context.siblings && context.siblings.flatMap((h) => h.indicators || []));
  const nb = context.neighbours || {};
  [...(nb.sharedStart || []), ...(nb.sharedEnd || [])].forEach((n) => add(n.indicators));
  return [...seen.values()].sort(
    (a, b) => parseInt((a.spelling || a.code).slice(1), 10) - parseInt((b.spelling || b.code).slice(1), 10)
  );
};

const indicatorKeyLines = (context) => {
  const inds = allIndicators(context);
  const w = inds.length ? Math.max(...inds.map((i) => (i.spelling || i.code).length)) : 0;
  return inds.map((i) => {
    const code = i.spelling || i.code;
    const effect = i.purpose ? i.purpose.charAt(0).toLowerCase() + i.purpose.slice(1) : i.name || '';
    return `  ${code.padEnd(w)} — ${effect}`;
  });
};

const siblingLines = (context) =>
  context.siblings.filter((h) => h.gloss).map((h) => `  (${h.pos || '-'}) ${h.gloss}`);

const neighbourLines = (context, max = 5) => {
  const ns = context.neighbours || {};
  const lines = [];
  for (const n of (ns.sharedStart || []).slice(0, max)) {
    if (n.gloss) lines.push(`  ${n.baseSpelling} = ${n.gloss} (shares start)`);
  }
  for (const n of (ns.sharedEnd || []).slice(0, max)) {
    if (n.gloss) lines.push(`  ${n.baseSpelling} = ${n.gloss} (shares end)`);
  }
  return lines;
};

const block = (lines, title, body) => {
  if (body && body.length) {
    lines.push('', `${title}:`, ...body);
  }
};

const OUTPUT_FORM = {
  Adjectival: 'All 5 guesses must be adjectives or adverbs.',
  Verbal: 'All 5 guesses must be verbs in the "to …" form.',
  Nominal: 'All 5 guesses must be singular nouns.',
};
const outputFormLine = (context) => {
  const groups = [...new Set((context.indicators || []).map((i) => i.group).filter(Boolean))];
  for (const g of groups) if (OUTPUT_FORM[g]) return OUTPUT_FORM[g];
  return 'All 5 guesses must be singular nouns (unless the concept is one English only writes in the plural).';
};

const SYSTEM_PROMPT = "Decode the complete Bliss spelling using its supplied dictionary evidence. Return five ranked conventional English words or fixed terms. Do not invent character meanings. The spelling is ordered, not a bag of glosses; related entries are clues, not automatically the answer.\n\nEach single character or supplied contiguous compound is one concept. In an ordinary classifier/specifier pair, the first concept is what the result names; the second qualifies it. Infer their implicit relationship from context, without swapping which concept is being named. English word order can differ from Bliss order. A genuine leading modifier instead operates on its following concept or group with its supplied effect; appearing in the modifier table alone does not establish that role.\n\nCombine adjacent concepts recursively. Use a known compound intact with all uncovered parts in order before reopening its characters; another coherent grouping remains possible. The longest unit is not automatically decisive. Resolve its contextual sense, which can be broader or more abstract than its familiar standalone gloss. Appending a concept is not replacing one. Adjacent digits form a positional numeral: normally an index after a concept, a quantity before it, unless a known unit establishes otherwise.\n\nA semicolon attaches an indicator to its preceding character. B97 and B6436 select concrete and abstract senses of that character, not the whole word's part of speech or concreteness. Supplied explicit contrasts guide their senses; elsewhere an unmarked concept can cover either. Other indicators are grammatical and normally attach to the head; use the indicator key for the complete target's form. B85 commonly describes potential/ability, B84 a resulting state, B86 ordinary context-dependent description that can also express a resulting state; a supplied B84/B86 contrast helps distinguish them.\n\nAn unmarked ordinary word is a noun, not a verb or adjective. Context can identify the small exceptional function, pronoun, preposition, number and colour sets; colours can be adjectival. Use singular count nouns unless marked plural, retain naturally plural English terms, and write verbs as \"to ...\". Embedded non-head concepts normally lose grammatical marking but retain their lexical meaning; semantic marking is not thereby removed. Related grammatical forms can reveal an unstated noun sense without imposing a universal concrete-first or process-first rule.\n\nUse the evidence together. Derive a whole-base grammatical sibling's corresponding target form from its actual lexical concept, preserving its participants and qualifications; semantic-indicator differences are not grammatical identity. Keep a supported counterpart available alongside other readings unless the source meaning contradicts it. From a longer unchanged target-containing entry, remove only the added span's licensed contribution. From an aligned neighbour, change only the differing conceptual operand while preserving the shared construction. Recurring contiguous spans across different neighbours can suggest a shared contribution, not define their non-shared parts. An inference is not an attested definition or another independent source.\n\nFind the conventional name for each supported COMPLETE meaning, in the required form. It must name the qualified main concept, not an associated participant, tool, place, property or component. A name may convey clues implicitly; do not add literal qualifiers just to repeat glosses. Context can support a general term, a familiar specific member, or both; every important clue must fit, but need not uniquely identify a member. Commonness alone is not evidence. Keep genuinely different supported meanings before extra synonyms; do not fill slots with invented compounds, wrong relations or unchecked associations.\n\nEnd with this final line:\nFINAL: a JSON array of exactly five distinct English names, strongest combined support first.\nUse no code fence or square brackets before FINAL, and nothing after the array.";

const legendLines = (context) => {
  const byCode = new Map();
  for (const e of context.legend || []) {
    if (!e.gloss) continue;
    if (!byCode.has(e.spelling)) byCode.set(e.spelling, []);
    byCode.get(e.spelling).push(e.gloss);
  }
  if (!byCode.size) return [];
  const w = Math.max(...[...byCode.keys()].map((s) => s.length));
  return [...byCode.entries()].map(([code, glosses]) => `  ${code.padEnd(w)} — ${glosses.join('; ')}`);
};

const headLine = (context) => {
  const tokens = (context.baseSpelling || context.spelling || '').split('/');
  if (tokens.length < 2) return null;
  const covered = new Set();
  for (const m of context.modifiers || []) {
    if (Array.isArray(m.span)) for (let i = m.span[0]; i < m.span[1]; i++) covered.add(i);
  }
  let headIdx = tokens.findIndex((_, i) => !covered.has(i));
  if (headIdx < 0) headIdx = tokens.length - 1;
  return `Head glyph (the classifier the rest builds on): ${tokens[headIdx]} (glyph ${headIdx + 1})`;
};

const userContent = (context) => {
  const lines = [
    `Bliss word to decode (B-code spelling): ${context.spelling}  (${context.charCount} character${context.charCount === 1 ? '' : 's'})`,
  ];
  const head = headLine(context);
  if (head) lines.push(head);
  const grammar = grammarSummary(context);
  if (grammar) lines.push(grammar);
  block(lines, "Building-block glyphs (each glyph's meaning shifts with its grammar indicator)", subwordSenseLines(context));
  block(lines, 'Concepts that can act as modifiers', modifierLines(context));
  block(lines, 'Sibling words (other entries written with the same glyphs)', siblingLines(context));
  block(lines, "Neighbour words (share this word's opening or ending glyphs)", neighbourLines(context, Infinity));
  block(lines, 'Glyph legend (decodes the other B-codes that appear in the sibling and neighbour words above)', legendLines(context));
  block(lines, 'Indicator key (same code = same grammatical effect wherever it appears)', indicatorKeyLines(context));
  return lines.join('\n');
};

const buildBaseMessages = (context) => [
  { role: 'system', content: SYSTEM_PROMPT },
  { role: 'user', content: userContent(context) },
];

// ────────────────────────────────────────────────────────────────────────────────────────────

const SIBLING_TITLE = 'Sibling words (other entries written with the same glyphs)';
const NEIGHBOUR_TITLE = "Neighbour words (share this word's opening or ending glyphs)";

const renderedBlock = (title, lines) =>
  lines.length ? `\n\n${title}:\n${lines.join('\n')}` : '';

const exactSiblingLines = (context) => {
  const siblings = (context.siblings || []).filter((helper) => helper.gloss);
  return siblings.map((helper) => {
    const spelling = helper.spelling || helper.baseSpelling || '';
    return `  ${spelling} (${helper.pos || '-'}) ${helper.gloss}`;
  });
};

const exactNeighbourLines = (context) => {
  const neighbours = context.neighbours || {};
  const related = [
    ...(neighbours.sharedStart || []).map((helper) => ({ helper, relation: 'shares start' })),
    ...(neighbours.sharedEnd || []).map((helper) => ({ helper, relation: 'shares end' })),
  ].filter(({ helper }) => helper.gloss);
  return related.map(({ helper, relation }) => {
    const spelling = helper.spelling || helper.baseSpelling || '';
    return `  ${spelling} = ${helper.gloss} (${relation})`;
  });
};

const replaceBlock = (content, title, oldLines, newLines) => {
  const oldBlock = renderedBlock(title, oldLines);
  const newBlock = renderedBlock(title, newLines);
  if (!oldBlock) {
    if (newBlock) throw new Error(`Prompt omitted expected ${title} block.`);
    return content;
  }
  if (!content.includes(oldBlock)) {
    throw new Error(`The ${title} rendering changed; exact-evidence replacement is no longer safe.`);
  }
  return content.replace(oldBlock, () => newBlock);
};

const buildMessages = (context) => buildBaseMessages(context).map((message) => {
  if (message.role !== 'user') return message;

  let content = replaceBlock(
    message.content,
    SIBLING_TITLE,
    siblingLines(context),
    exactSiblingLines(context),
  );
  content = replaceBlock(
    content,
    NEIGHBOUR_TITLE,
    neighbourLines(context, Infinity),
    exactNeighbourLines(context),
  );

  return { ...message, content };
});

// Adapter — maps the inlined buildMessages(context) -> [{system},{user}] onto the
// { name, systemPrompt, build } shape, and shields against minor context field-name drift.
// ────────────────────────────────────────────────────────────────────────────────────────────
const __fill = (o, k, v) => {
  if (o && (o[k] === undefined || o[k] === null) && v !== undefined && v !== null) o[k] = v;
};
const __nz = (v) => (v === undefined || v === null ? undefined : v);

// Non-destructive: only FILLS missing fields from plausible aliases; never overwrites yours.
const normalizeContext = (ctx) => {
  if (!ctx || typeof ctx !== 'object') return ctx;
  const c = { ...ctx };
  __fill(c, 'baseSpelling', __nz(c.notation) ?? c.spelling);
  __fill(c, 'spelling', c.notation);
  __fill(c, 'charCount', typeof c.spelling === 'string' && c.spelling ? c.spelling.split('/').length : undefined);
  c.indicators = (c.indicators || []).map((i) => {
    const x = { ...i };
    __fill(x, 'spelling', __nz(x.notation) ?? x.code);
    return x;
  });
  c.modifiers = (c.modifiers || []).map((m) => {
    const x = { ...m };
    __fill(x, 'spelling', __nz(x.notation) ?? (Array.isArray(x.codes) ? x.codes.join('/') : undefined));
    return x;
  });
  c.subwords = (c.subwords || []).map((s) => {
    const x = { ...s };
    __fill(x, 'baseSpelling', __nz(x.notation) ?? x.spelling);
    __fill(x, 'spelling', x.notation);
    __fill(x, 'length', (x.baseSpelling || x.spelling || '').split('/').filter(Boolean).length || undefined);
    x.helpers = (x.helpers || []).map((h) => {
      const y = { ...h };
      __fill(y, 'baseSpelling', __nz(y.notation) ?? y.spelling);
      __fill(y, 'spelling', y.notation);
      return y;
    });
    return x;
  });
  c.siblings = (c.siblings || []).map((h) => ({ ...h }));
  const nb = c.neighbours || {};
  const fixN = (n) => {
    const x = { ...n };
    __fill(x, 'baseSpelling', __nz(x.notation) ?? x.spelling);
    __fill(x, 'spelling', x.notation);
    return x;
  };
  c.neighbours = { ...nb, sharedStart: (nb.sharedStart || []).map(fixN), sharedEnd: (nb.sharedEnd || []).map(fixN) };
  c.legend = (c.legend || []).map((e) => {
    const x = { ...e };
    __fill(x, 'spelling', x.notation);
    return x;
  });
  return c;
};

// A minimal stub context just to read the constant system message at load time (it does not
// depend on per-target data). The user message it would produce is discarded.
const __STUB = {
  spelling: '', baseSpelling: '', charCount: 0,
  modifiers: [], indicators: [], subwords: [], siblings: [],
  neighbours: { sharedStart: [], sharedEnd: [], omitted: 0 }, legend: [],
};
const __system = (buildMessages(__STUB).find((m) => m.role === 'system') || {}).content;

export default {
  name: "hlridge-v382",
  systemPrompt: __system,
  build: (context) => {
    const msgs = buildMessages(normalizeContext(context));
    const user = msgs.find((m) => m.role === 'user');
    return user ? user.content : '';
  },
};
