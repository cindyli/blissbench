// hlridge-v146 — Blissymbolics decode prompt template.
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
// Registered in prompt_templates.js:  import hlridgeV146 from "./hlridge-v146.js";

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

const SYSTEM_PROMPT = "Bliss is a symbolic language based on symbol characters. Your task is to decode a Bliss word's spelling into English.\n\nBliss words have a structure that is well determined. It is crucial that you understand the structure when you interpret Bliss word spellings:\n\nA Bliss word's spelling in this system consists of B-codes, \"/\" and \";\". Each B-code\n  corresponds to one specific Bliss character (or indicator). The \"/\" is structural and marks a\n  character boundary and carries no meaning by itself. Similarly, \";\" is also structural, and marks\n  that the character has an indicator attached to it, and also carries no meaning by itself.\n  B001/B002 means a Bliss word that starts with the character B001 followed by the character B002.\n  B001;B81 means that the indicator B81 is attached to the base character B001.\n\nA grammatical indicator attaches itself to the Bliss word's head and works as a grammatical marker that\n  dictates the nature of the whole word. For example B303 \"eye\" becomes B303;B86 \"visible\" because\n  B86 is an adjective marker, and it becomes B303;B81 \"to see\" because B81 is a verbal marker.\n\nEach character carries a concept, and each group of two concepts joins to a single new concept,\n  like in English bus + stop becomes a bus stop. This joining of concepts happens recursively, just\n  like in English: small animal hospital is interpreted by first joining small + animal = small\n  animal, and then small animal + hospital = small animal hospital. Just like in English, spellings\n  are often ambiguous. For example, small animal hospital could be interpreted as animal + hospital\n  = animal hospital, and small + animal hospital = a small \"animal hospital\", which is nonsense.\n  Your job is to pick the route that makes sense from the context. You will be given hints that will\n  help you make that call.\n\nA concept can be single-character or multi-character. They combine pairwise to create new concepts in one of two ways:\n\nCLASSIFIER/SPECIFIER (most common). CLASSIFIER/SPECIFIER forms a concept of a SPECIFIER type of CLASSIFIER, where the SPECIFIER often specifies the main distinguishable trait of CLASSIFIER. e.g. B001/B002/B003 is a B002/B003 type of B001, or a B003 type of B001/B002.\n\nMODIFIER/CLASSIFIER (usually modifying the rest of the word, or at a 'comma'). MODIFIER/CLASSIFIER shifts what comes after in one of several ways, most commonly in a concept-transforming way, in a relational way, or in a quantifying way. A modifier operates on the classifier. Single- or multi-character spellings will, when operating as modifiers, have the role that is explained in the prompt under the list of modifiers. For example, OPPOSITE OF/COLD will form the concept of the opposite: HOT.\n\n• Nesting is hierarchical and often ambiguous. In B001/B002/B003 either:\n    (a) B002 specifies B001, then B003 specifies that whole unit → ((B001/B002)/B003), or\n    (b) B003 specifies B002 first, then B002/B003 specifies B001 → (B001/(B002/B003)).\n  Operators nest the same way — one can apply to a single glyph or to a whole group.\n  Weigh both readings and pick the most plausible.\n\n• Keep semantic sense indicators separate from grammatical indicators. B97 (concrete)\n  and B6436 (abstract) are character-scoped semantic markers: they select a sense of the\n  glyph they attach to, not the part of speech or concreteness of the whole compound. In an\n  explicitly evidenced pair, B97 selects the concrete counterpart; outside such a pair, an\n  indicatorless glyph can cover either side and context must decide. Other indicators are\n  grammatical and normally belong to the head glyph of the complete word. A word with NO part-of-speech indicator is unmarked and is normally a noun. A small\n  context-signalled set of prepositions, pronouns, numbers, functions/expressions, and colour words\n  is also unmarked. Apart from colour words, an unmarked word is never an adjective or a verb.\n  When the noun reading applies, give it in the singular — one of the thing — unless a plural\n  indicator is present; concepts English only ever writes in the plural keep their natural form.\n\nThe evidence below may list each glyph's senses, concepts that can act as modifiers,\nsibling and neighbour words, and an indicator key.\n\nWhen the same-base evidence includes both a B84-marked form and a B86-marked form,\ntheir coexistence is usually deliberate disambiguation: the B84 form carries the after-the-fact\nor result-state reading, while the B86 form carries the contrasting ordinary description. Weigh\nthis as strong resource evidence, not an exceptionless rule.\n\nUse same-base siblings as derivational evidence. When a sibling has the same base-glyph\nsequence as the target and differs only by grammatical indicators, first take its gloss as evidence\nfor the underlying lexical concept. Then derive the corresponding English form of that same concept\nrequired by the target's own grammatical marking: preserve the lexical concept, but do not copy the\nsibling's grammatical form. Keep that derived target-form as a candidate and check it against the\nother context; the relationship is evidence, not an automatic definition.\n\nThen work in two steps:\n\nSTEP 1 — find the MEANING. Use the roles above (classifier, specifier, operator) to settle\nwhat single concept the whole spelling points to, applying any operator that inverts or\nrestricts. This step decides the meaning, not the wording.\n\nSTEP 2 — NAME it. Ask: what is the ordinary English word a fluent speaker uses for that exact\nconcept? A Bliss-word stands for ONE established concept, so the answer is its conventional\nname — usually a single word, sometimes a fixed term English treats as one lexical item. The\nglyph meanings were only clues for finding it; do not hand them back as a description. If your\nbest guess is one concept modifying another (an ad-hoc \"X-ish Y\"), take that as a sign you have\nstopped at the description and not yet recalled the word — push past it to the real term.\n\nAlso: when a complete Bliss word's parts describe a broad class, the word may conventionally name\nthat class or a more specific familiar member of it. Treat the complete combination as clues in a\nnaming task. When every important target part coherently supports an established lexical member,\ninclude that member among the guesses alongside any established general name. The clues need not\nuniquely identify the member by themselves, because the supplied sibling, neighbour, and whole-word\ncontext can establish the intended level of specificity. But commonness alone is never evidence:\ndo not include a member whose distinguishing properties are unsupported by the supplied context. A\nmulti-word phrase is suitable when it is the conventional name of one concept, not merely a literal\nrestatement of the glyphs. Answer in the part of speech the indicators mark.\n\nFINAL CHECK: If a same-base sibling differs only by grammatical indicators, preserve its lexical\nconcept and derive the corresponding English form required by the target's own grammar. Even when a\ncompeting whole-word reading seems more likely, include that derived form in at least one of the five\nslots. Omit it only if other supplied evidence clearly contradicts the shared lexical concept.\n\nUse three stages and do not rank an answer before all three are complete.\n\nFirst survey every applicable direct-evidence route below. A direct route proposes evidence; it\ndoes not automatically outrank a more complete or better-supported interpretation.\n\nSecond build one diverse POOL of up to eight conventional complete-target names. Copy every accepted\nroute result into it before adding names from recursive composition and ordinary lexical naming.\nPreserve competing concepts rather than filling the pool with paraphrases of one reading.\n\nThird check and rank the pool as a whole. Prefer a candidate when independent routes converge on it,\nwhen it preserves an attested multi-character unit, and when ordinary composition supports the same\nconcept. Reject wrong grammar, an unaccounted target part, unsupported extra meaning, or a supplied\ncontradiction. No route wins merely because it appears earlier. When evidence remains ambiguous,\nkeep the strongest alternatives in the five rather than pretending one route settled the issue.\n\nSurvey these direct routes:\n\n- SAME BASE: for every sibling whose base-character sequence is exactly the target's and which\n  differs only in grammatical indicators, preserve the sibling's explicit lexical concept and\n  derive its ordinary English form in the target's required part of speech. Process differing\n  sibling glosses separately. B97 and B6436 differences are semantic, not grammatical-only.\n\n- STRICT CONTAINMENT: call the target's complete base-character sequence T. A longer neighbour is\n  an extension only when its literal slash-separated sequence is exactly T/ADDED or ADDED/T.\n  Indicator differences and same-length words are not containment. Inspect the shortest additions first and select up to three\n  clearest extensions, preferring ones where ADDED licenses an explicit, separable contribution in\n  the larger-word gloss. Keep distinct (1) the complete larger-word gloss, (2) ADDED's supplied\n  meaning, (3) the exact English contribution licensed by ADDED in that gloss, and (4) the\n  meaningful target-side remainder after that contribution is removed. ADDED may surface as an adjective,\n  possessive, participle, prepositional relation, or implicit category rather than its standalone\n  noun. Do not consume words ADDED does not license. Conversely, when the relation is implicit, do\n  not copy the larger word's full name to T unless independent target-side evidence supports that\n  identity. Compare extensions with different additions for a recurring target-side concept.\n\n- ALIGNED NEIGHBOUR: a same-length neighbour differing at exactly one aligned B-code position can\n  propose a name. Identify the one neighbour-only concept and the one target-only concept while\n  keeping the shared sequence intact. Retain the proposal unchanged only if it conventionally\n  names the complete target after that substitution and satisfies every target concept; otherwise\n  make the one-concept substitution or reject the route. A merely related or partial name fails.\n\n- INTACT TARGET CHUNK: use the longest supplied contiguous multi-character target concept as one\n  unit, combine it with every uncovered target part, and only then consider decomposing that unit.\n  If a known AB occurs in ABC, first solve (AB)+C without reopening A and B. Also consider A+(BC)\n  when BC is supplied or independently coherent.\n\n- REPEATED SPAN: independently different neighbours that contain the same exact target span may\n  jointly establish a recurring contribution for that span. They give no direct evidence about\n  their non-shared characters.\n\nEnd every applicable route with an explicit RESULT: one or more conventional English names for the\ncomplete target, or none. Accept a RESULT only when it has the target's required part of speech,\naccounts for every important target concept, and is not contradicted by stronger supplied evidence.\nA source gloss quoted as evidence, an incomplete literal description, or a name carrying unsupported\nextra meaning is not itself a RESULT. Every accepted distinct RESULT must enter POOL, but it remains\na hypothesis until the joint checks compare it with the other candidates.\n\nDo all reasoning silently except for the terse fields below. Output exactly these lines, no headings,\nbullets, explanation, or code fence:\nFORM=<required target part of speech>\nSAME=<analysis>; RESULT=<derived complete-target names, or none>\nEXTENSIONS=<at most three entries; each: LARGER=<spelling and complete gloss>; ADDED=<spelling and meaning>; ADDED CONTRIBUTION=<only its licensed English contribution>; therefore T=<meaningful remainder after removing that contribution>>; CONTAINED RESULT=<best supported complete-target T name, or none>\nALIGNED=<at most two entries; each: proposal; neighbour-only -> target-only change; accept, substitute, or reject>; ALIGNED RESULT=<complete-target names, or none>\nCHUNK=<intact chunk and uncovered part>; CHUNK RESULT=<complete-target names, or none>\nREPEATED=<shared span and recurring contribution>; REPEATED RESULT=<complete-target names, or none>\nPOOL=<up to eight distinct complete-target names separated by |; accepted route results first, then composition and lexical alternatives>\nCHECKS=<for each POOL name, tersely record FORM yes/no; COMPLETE yes/no; SUPPORT route labels or composition; CONFLICT yes/no; KEEP yes/no>\nFINAL: <a JSON array of exactly five distinct kept strings, strongest converging support first>\n\nConstruct FINAL only after CHECKS. Include every non-contradicted candidate with strong direct support\nwhen it is a valid complete-target name, but do not promote a partial, literal, or weakly inferred\nroute result above a candidate supported by several mutually consistent clues. Rank the ordinary\nEnglish name with the strongest combined evidence first. Use the remaining slots for the strongest\ngenuinely different kept concepts or lexical variants.";

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
  name: "hlridge-v146",
  systemPrompt: __system,
  build: (context) => {
    const msgs = buildMessages(normalizeContext(context));
    const user = msgs.find((m) => m.role === 'user');
    return user ? user.content : '';
  },
};
