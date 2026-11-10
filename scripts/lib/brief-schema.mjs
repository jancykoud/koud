import { hasExplicitOffset } from './iso-datetime.mjs';
import { TRACKS } from './schema.mjs';

export const BRIEF_SCHEMA_VERSION = 1;
export const DATE_KINDS = ['hard', 'milestone'];
export { TRACKS };

/** A one-liner longer than this stops being one line in a status board or a README. */
export const ONE_LINER_MAX = 160;

const KNOWN_TOP_LEVEL = new Set([
  'schema_version', 'track', 'identity', 'problem', 'audience', 'goals', 'non_goals',
  'criteria', 'tech', 'constraints', 'dates', 'unresolved',
]);

const isNonEmptyString = (v) => typeof v === 'string' && v.trim() !== '';
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Validate a project brief. The brief is the one place a project is described: every later
 * phase reads it instead of asking again, so a gap here is a question that comes back five
 * times. Returns every problem at once -- an agent retrying needs the whole list, not one
 * error per round trip.
 */
export function validateBrief(brief) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(brief)) {
    return { valid: false, errors: ['brief must be an object'], warnings };
  }

  if (brief.schema_version !== BRIEF_SCHEMA_VERSION) {
    errors.push(`schema_version ${brief.schema_version} != supported ${BRIEF_SCHEMA_VERSION}`);
  }

  for (const key of Object.keys(brief)) {
    if (!KNOWN_TOP_LEVEL.has(key)) {
      warnings.push(`unknown top-level key "${key}" (kept, not validated)`);
    }
  }

  if (!TRACKS.includes(brief.track)) {
    errors.push(`track must be one of ${TRACKS.join(', ')}, got "${brief.track}"`);
  }

  validateIdentity(brief.identity, errors, warnings);

  if (!isNonEmptyString(brief.problem)) {
    errors.push('problem must be a non-empty string — a project with no stated problem cannot be scoped');
  }

  validateAudience(brief.audience, errors);
  validateStringList(brief.goals, 'goals', errors, { allowEmpty: false });

  // Present-but-empty is allowed and warned about; missing is not. A brief that never
  // considered what is out of scope has not been scoped, and the later phases are where
  // that surfaces as features nobody asked for.
  validateStringList(brief.non_goals, 'non_goals', errors, { allowEmpty: true });
  if (Array.isArray(brief.non_goals) && brief.non_goals.length === 0) {
    warnings.push('non_goals is empty — name at least one thing this project will not do');
  }

  validateCriteria(brief.criteria, errors);
  validateTech(brief.tech, errors);
  validateConstraints(brief.constraints, errors);
  validateDates(brief.dates, errors);

  if (brief.unresolved !== undefined) {
    validateStringList(brief.unresolved, 'unresolved', errors, { allowEmpty: true });
    if (Array.isArray(brief.unresolved) && brief.unresolved.length > 0) {
      warnings.push(
        `${brief.unresolved.length} open question(s) in unresolved — answer or accept each one before approving the brief`,
      );
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateIdentity(identity, errors, warnings) {
  if (!isPlainObject(identity)) {
    errors.push('identity must be an object');
    return;
  }
  if (!isNonEmptyString(identity.name)) errors.push('identity.name must be a non-empty string');
  if (!isNonEmptyString(identity.one_liner)) {
    errors.push('identity.one_liner must be a non-empty string');
  } else if (identity.one_liner.length > ONE_LINER_MAX) {
    warnings.push(`identity.one_liner is ${identity.one_liner.length} characters — keep it under ${ONE_LINER_MAX}`);
  }
}

function validateAudience(audience, errors) {
  if (!Array.isArray(audience) || audience.length === 0) {
    errors.push('audience must be a non-empty array — name at least one kind of user');
    return;
  }
  for (const [i, a] of audience.entries()) {
    const where = `audience[${i}]${isNonEmptyString(a?.name) ? ` (${a.name})` : ''}`;
    if (!isNonEmptyString(a?.name)) errors.push(`${where}.name must be a non-empty string`);
    // A persona without a need is a label, not a user: nothing downstream can be traced to it.
    if (!isNonEmptyString(a?.need)) errors.push(`${where}.need must be a non-empty string`);
  }
}

function validateStringList(list, name, errors, { allowEmpty }) {
  if (!Array.isArray(list)) {
    errors.push(`${name} must be an array${allowEmpty ? ' (empty is allowed; missing is not)' : ''}`);
    return;
  }
  if (!allowEmpty && list.length === 0) errors.push(`${name} must contain at least one entry`);
  for (const [i, item] of list.entries()) {
    if (!isNonEmptyString(item)) errors.push(`${name}[${i}] must be a non-empty string`);
  }
}

function validateCriteria(criteria, errors) {
  if (!isPlainObject(criteria)) {
    errors.push('criteria missing');
    return;
  }
  const items = criteria.items;
  if (!Array.isArray(items) || items.length === 0) {
    errors.push('criteria.items must contain at least one success criterion');
    return;
  }

  const seen = new Set();
  for (const [i, item] of items.entries()) {
    const where = `criteria.items[${i}]${isNonEmptyString(item?.id) ? ` (${item.id})` : ''}`;
    if (!isNonEmptyString(item?.id)) {
      errors.push(`${where}.id must be a non-empty string`);
    } else {
      // The id is a join key: requirements.json points at it from every feature.
      if (!SLUG.test(item.id)) errors.push(`${where}.id must be a lowercase slug (letters, digits, hyphens)`);
      if (seen.has(item.id)) errors.push(`${where} has a duplicate id "${item.id}"`);
      seen.add(item.id);
    }
    if (!isNonEmptyString(item?.name)) errors.push(`${where}.name must be a non-empty string`);
    // The statement is what a reviewer checks the finished product against. A criterion
    // with only a name ("Fast") cannot be verified by anyone.
    if (!isNonEmptyString(item?.statement)) {
      errors.push(`${where}.statement must be a non-empty string — say how anyone will know it is met`);
    }
  }

  // rank is the priority order: when two criteria pull in different directions, the lower
  // rank wins. Gaps or duplicates make that order ambiguous.
  const ranks = items.map((i) => i?.rank).sort((a, b) => a - b);
  const contiguous = ranks.every((r, i) => r === i + 1);
  if (!contiguous) {
    errors.push(`criteria.items ranks must be contiguous 1..${items.length}, got ${ranks.join(', ')}`);
  }
}

function validateTechList(list, name, errors) {
  if (!Array.isArray(list)) {
    errors.push(`${name} must be an array`);
    return;
  }
  for (const [i, entry] of list.entries()) {
    const where = `${name}[${i}]`;
    if (!isPlainObject(entry)) {
      errors.push(`${where} must be an object with a name`);
      continue;
    }
    if (!isNonEmptyString(entry.name)) errors.push(`${where}.name must be a non-empty string`);
    if (entry.one_of !== undefined) {
      const ok = Array.isArray(entry.one_of) && entry.one_of.length > 0 && entry.one_of.every(isNonEmptyString);
      if (!ok) errors.push(`${where}.one_of must be a non-empty array of strings when present`);
    }
  }
}

function validateTech(tech, errors) {
  if (!isPlainObject(tech)) {
    errors.push('tech must be an object');
    return;
  }
  // Empty is a real answer ("no technology is imposed"); missing means nobody asked.
  if (!Array.isArray(tech.required)) {
    errors.push('tech.required must be an array (empty is allowed; missing is not)');
  } else {
    validateTechList(tech.required, 'tech.required', errors);
    // A required technology with no reason is how a constraint outlives the fact that
    // justified it. On the existing-project track the reason is "already in the codebase".
    for (const [i, entry] of tech.required.entries()) {
      if (isPlainObject(entry) && !isNonEmptyString(entry.reason)) {
        errors.push(`tech.required[${i}].reason must be a non-empty string — say why it is imposed`);
      }
    }
  }
  if (tech.forbidden !== undefined) validateTechList(tech.forbidden, 'tech.forbidden', errors);
  if (tech.preferred !== undefined) validateTechList(tech.preferred, 'tech.preferred', errors);
}

function validateConstraints(constraints, errors) {
  if (constraints === undefined) return;
  if (!isPlainObject(constraints)) {
    errors.push('constraints must be an object when present');
    return;
  }
  for (const key of ['hosting', 'budget']) {
    if (constraints[key] !== undefined && !isNonEmptyString(constraints[key])) {
      errors.push(`constraints.${key} must be a non-empty string when present`);
    }
  }
  if (constraints.compliance !== undefined) {
    validateStringList(constraints.compliance, 'constraints.compliance', errors, { allowEmpty: true });
  }
}

function validateDates(dates, errors) {
  if (dates === undefined) return;
  if (!Array.isArray(dates)) {
    errors.push('dates must be an array when present');
    return;
  }
  let hard = 0;
  for (const [i, d] of dates.entries()) {
    const where = `dates[${i}]${isNonEmptyString(d?.label) ? ` (${d.label})` : ''}`;
    if (!isNonEmptyString(d?.label)) errors.push(`${where}.label must be a non-empty string`);
    // A floating "2027-01-15T17:00:00" means a different instant in every time zone.
    if (!hasExplicitOffset(d?.at)) {
      errors.push(`${where}.at must be ISO 8601 with an explicit UTC offset, got "${d?.at}"`);
    }
    if (!DATE_KINDS.includes(d?.kind)) {
      errors.push(`${where}.kind must be one of ${DATE_KINDS.join(', ')}, got "${d?.kind}"`);
    }
    if (d?.kind === 'hard') hard += 1;
  }
  if (hard > 1) errors.push(`dates may contain at most one "hard" date (the delivery deadline), found ${hard}`);
}
