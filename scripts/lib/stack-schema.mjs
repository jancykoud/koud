import { REPO_SHAPES } from './schema.mjs';

export const STACK_SCHEMA_VERSION = 1;
export const SOURCES = ['required', 'default', 'preferred', 'replacement'];
export const THESIS_SUPPORT = ['carries', 'supports', 'neutral'];
export { REPO_SHAPES };

const isNonEmptyString = (v) => typeof v === 'string' && v.trim() !== '';

// brief.tech.required[]/forbidden[] entries carry a human `name` (e.g. "AWS Database"),
// not a stable `id`. requirement_ref needs something short and stable to point at, so we
// derive it deterministically from the name (an explicit `.id`, if a future brief shape
// adds one, wins over the derived slug).
function slugify(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * The join key for a brief.tech.required[]/forbidden[] entry. Exported so other tasks
 * — notably the compliance checker, which seeds compliance.required_tech_verified —
 * derive the exact same key this validator uses. Two independent derivations would
 * silently disagree and the checker would end up tracking keys nothing ever sets.
 */
export function requirementKey(entry) {
  if (typeof entry === 'string') return slugify(entry);
  return isNonEmptyString(entry?.id) ? entry.id : slugify(entry?.name);
}

function identifyTech(entry) {
  const id = requirementKey(entry);
  const label = typeof entry === 'string' ? entry : (entry?.label ?? entry?.name ?? id);
  return { id, label };
}

/**
 * Validate a stack payload. `brief` is optional; when supplied, required and forbidden
 * tech are cross-checked against the real rules. An uncovered mandate is an error, not a
 * warning: a stack that drops a technology the brief requires is not the project that was asked for.
 */
export function validateStack(doc, brief) {
  const errors = [];
  const warnings = [];

  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    return { valid: false, errors: ['stack must be an object'], warnings };
  }
  if (doc.schema_version !== STACK_SCHEMA_VERSION) {
    errors.push(`schema_version ${doc.schema_version} != supported ${STACK_SCHEMA_VERSION}`);
  }
  if (!REPO_SHAPES.includes(doc.repo_shape)) {
    errors.push(`repo_shape "${doc.repo_shape}" is not one of ${REPO_SHAPES.join(', ')}`);
  }
  if (!isNonEmptyString(doc.shape_rationale)) {
    errors.push('shape_rationale must say why this shape, not just which');
  }

  const slots = Array.isArray(doc.slots) ? doc.slots : null;
  if (slots === null) {
    errors.push('slots must be an array');
    return { valid: false, errors, warnings };
  }
  if (slots.length === 0) errors.push('slots must not be empty');

  const seen = new Set();
  for (const [i, slot] of slots.entries()) {
    const at = `slots[${i}]`;
    if (slot === null || typeof slot !== 'object') {
      errors.push(`${at} must be an object`);
      continue;
    }
    if (!isNonEmptyString(slot.id)) errors.push(`${at}.id must be a non-empty string`);
    else if (seen.has(slot.id)) errors.push(`${at}.id "${slot.id}" is a duplicate slot`);
    else seen.add(slot.id);

    if (!isNonEmptyString(slot.choice)) errors.push(`${at}.choice must be a non-empty string`);
    if (!SOURCES.includes(slot.source)) {
      errors.push(`${at}.source "${slot.source}" is not one of ${SOURCES.join(', ')}`);
    }
    if (!isNonEmptyString(slot.rationale)) {
      errors.push(`${at}.rationale must say why this choice, not just what it is`);
    }
    if (!THESIS_SUPPORT.includes(slot.thesis_support)) {
      errors.push(`${at}.thesis_support "${slot.thesis_support}" is not one of ${THESIS_SUPPORT.join(', ')}`);
    }
    if (slot.source === 'required' && !isNonEmptyString(slot.requirement_ref)) {
      errors.push(`${at}.requirement_ref is required when source is "required" — it is the trace back into brief.json`);
    }
  }

  // If nothing carries the thesis, the brief's one-liner has no architecture behind
  // it. Naming a technology without a reason is the failure mode; this makes it mechanical.
  if (slots.length > 0 && !slots.some((s) => s?.thesis_support === 'carries')) {
    errors.push('no slot has thesis_support "carries" — the technology thesis has nothing standing behind it');
  }

  validateBleedingEdge(doc.bleeding_edge, seen, errors, warnings);
  validateRejected(doc.rejected, errors);
  crossCheckBrief(slots, brief, errors, warnings);

  return { valid: errors.length === 0, errors, warnings };
}

function validateBleedingEdge(list, slotIds, errors, warnings) {
  if (list === undefined) return;
  if (!Array.isArray(list)) {
    errors.push('bleeding_edge must be an array when present');
    return;
  }
  for (const [i, pin] of list.entries()) {
    const at = `bleeding_edge[${i}]`;
    if (pin === null || typeof pin !== 'object') {
      errors.push(`${at} must be an object`);
      continue;
    }
    if (!isNonEmptyString(pin.package)) errors.push(`${at}.package must be a non-empty string`);
    if (!isNonEmptyString(pin.pin)) errors.push(`${at}.pin must be a non-empty string`);
    if (isNonEmptyString(pin.slot) && !slotIds.has(pin.slot)) {
      errors.push(`${at}.slot "${pin.slot}" is not one of the declared slots`);
    }
    if (!isNonEmptyString(pin.docs_path)) {
      warnings.push(`${at}.docs_path is missing — the drift banner will have nowhere to point`);
    }
  }
}

function validateRejected(list, errors) {
  if (list === undefined) return;
  if (!Array.isArray(list)) {
    errors.push('rejected must be an array when present');
    return;
  }
  for (const [i, r] of list.entries()) {
    const at = `rejected[${i}]`;
    if (r === null || typeof r !== 'object') {
      errors.push(`${at} must be an object`);
      continue;
    }
    if (!isNonEmptyString(r.choice)) errors.push(`${at}.choice must be a non-empty string`);
    if (!isNonEmptyString(r.why_not)) {
      errors.push(`${at}.why_not must give the reason — a rejected option with no reason is not evidence of a decision`);
    }
  }
}

function crossCheckBrief(slots, brief, errors, warnings) {
  const hasBrief = brief !== undefined && brief !== null;
  const required = Array.isArray(brief?.tech?.required) ? brief.tech.required : null;
  const forbidden = Array.isArray(brief?.tech?.forbidden) ? brief.tech.forbidden : null;

  if (required === null) {
    warnings.push(
      hasBrief
        ? 'brief supplied but tech.required is missing or malformed — mandate coverage was not checked'
        : 'no brief supplied — required and forbidden tech checks were skipped',
    );
    return;
  }

  const coveringSlot = new Map();
  for (const s of slots) {
    if (s?.source === 'required' && isNonEmptyString(s?.requirement_ref)) {
      coveringSlot.set(s.requirement_ref, s);
    }
  }
  for (const req of required) {
    const { id, label } = identifyTech(req);
    if (!isNonEmptyString(id)) continue;
    const slot = coveringSlot.get(id);
    if (!slot) {
      errors.push(
        `required tech "${id}" (${label}) is not covered by any slot with source "required" — every technology the brief requires must be claimed by a slot`,
      );
      continue;
    }
    // Declaring the requirement_ref isn't enough — the chosen tech must actually be one
    // of the options the brief allows, or the declaration is decorative.
    const oneOf = Array.isArray(req?.one_of) ? req.one_of.filter(isNonEmptyString) : [];
    if (oneOf.length > 0) {
      const choice = String(slot.choice ?? '').toLowerCase();
      const satisfied = oneOf.some((opt) => choice.includes(String(opt).toLowerCase()));
      if (!satisfied) {
        const slotIndex = slots.indexOf(slot);
        errors.push(
          `slots[${slotIndex}].choice "${slot.choice}" does not satisfy required tech "${label}" — it must be one of: ${oneOf.join(', ')}`,
        );
      }
    }
  }

  if (forbidden !== null) {
    for (const [i, slot] of slots.entries()) {
      const choice = String(slot?.choice ?? '');
      for (const f of forbidden) {
        const { label: name } = identifyTech(f);
        if (isNonEmptyString(name) && choice.toLowerCase().includes(String(name).toLowerCase())) {
          errors.push(`slots[${i}].choice "${choice}" uses forbidden tech "${name}"`);
        }
      }
    }
  }
}
