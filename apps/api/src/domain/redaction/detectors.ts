import type { TextSpan } from '../shared/text-span';
import type { PiiType } from './redaction-summary';

/**
 * One PII entity found in the text. `key` is its canonical value: matches with the same type and
 * key get the same token, so `(415) 555-0142` and `415.555.0142` both become `[PHONE_1]`.
 */
export interface PiiMatch extends TextSpan {
  type: PiiType;
  key: string;
}

// Each pattern stops at the characters that end the entity in prose (whitespace, brackets, quotes),
// and multi-word patterns use `[ \t]` rather than `\s`, because an entity never spans a line break.
// Every quantifier on a repeated group is bounded, so no input backtracks badly. Hard negatives for
// each pattern live in `redact.test.ts`.

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu;

/** Characters a URL may contain in running text. Brackets and quotes end it (Markdown links). */
const URL_CHAR = String.raw`[^\s<>()\[\]"']`;
const URL = new RegExp(
  [
    String.raw`\bhttps?://${URL_CHAR}+`,
    String.raw`\bwww\.${URL_CHAR}+`,
    // Profile links written without a scheme; a bare "github.com" with no path is a product name.
    String.raw`(?<![\w.@/-])(?:[\w-]+\.)?(?:linkedin|github)\.com/${URL_CHAR}+`,
  ].join('|'),
  'giu',
);
/** Sentence punctuation that follows a URL rather than belonging to it. */
const URL_TRAILING_PUNCTUATION = /[.,;:!?*]+$/;

/** `(415) 555-0142`, `415-555-0142`, `415.555.0142`, `+1 415 555 0142`. */
const US_PHONE =
  /(?<![\w+])(?:\+?1[ \t.-]?)?(?:\(\d{3}\)[ \t.-]?|\d{3}[ \t.-])\d{3}[ \t.-]\d{4}(?!\w)/g;
/** `+44 20 7946 0958`, `+91 98765 43210`: a country code, then two to five digit groups. */
const INTERNATIONAL_PHONE = /(?<![\w+])\+\d{1,3}(?:[ \t.-]?\(?\d{1,5}\)?){2,5}(?!\w)/g;
/** E.164 allows at most 15 digits; fewer than 8 is a score or a count, not a phone number. */
const PHONE_DIGITS = { min: 8, max: 15 };
/** NANP numbers with and without the leading country code are the same number. */
const NANP_WITH_COUNTRY_CODE = /^1(\d{10})$/;

const CAPITALIZED_WORD = String.raw`[A-Z][\p{L}'.-]*`;
const STREET_SUFFIX = [
  String.raw`(?:Street|Avenue|Road|Boulevard|Lane|Drive|Court|Way|Place|Terrace|Parkway|Circle)\b`,
  String.raw`(?:St|Ave|Rd|Blvd|Ln|Dr|Ct|Pl|Pkwy|Cir)\b\.?`,
].join('|');
const UNIT = String.raw`(?:,?[ \t]+(?:(?:Apt|Apartment|Suite|Ste|Unit)\.?[ \t]*#?|#[ \t]?)[\w-]+)`;
const STREET = String.raw`\b\d{1,6}[ \t]+(?:${CAPITALIZED_WORD}[ \t]+){1,4}(?:${STREET_SUFFIX})${UNIT}?`;
/** `Springfield, IL 62704`. A ZIP alone is too often a metric ("25000 requests") to redact. */
const CITY_STATE_ZIP = String.raw`(?:${CAPITALIZED_WORD}[ \t]+){0,3}${CAPITALIZED_WORD},[ \t]*[A-Z]{2}[ \t]+\d{5}(?:-\d{4})?(?!\d)`;
const ADDRESS = new RegExp(
  String.raw`${STREET}(?:,?[ \t]+${CITY_STATE_ZIP})?|${CITY_STATE_ZIP}`,
  'gu',
);

const SCHOOL_WORD = String.raw`[A-Z][\p{L}'&.-]*`;
const SCHOOL_KEYWORD = String.raw`(?:University|College|Institute|School|Academy)\b`;
const OF_PLACE = String.raw`[ \t]+of[ \t]+(?:the[ \t]+)?${SCHOOL_WORD}(?:[ \t]+(?:and[ \t]+|&[ \t]+)?${SCHOOL_WORD}){0,3}`;
/**
 * "Lakeshore State University", "Harborview Institute of Technology", "University of Westbrook".
 * Case-sensitive, and a bare keyword ("School Choice") needs a name before it or an "of" place.
 */
const SCHOOL = new RegExp(
  String.raw`(?:${SCHOOL_WORD}[ \t]+){1,5}${SCHOOL_KEYWORD}(?:${OF_PLACE})?|${SCHOOL_KEYWORD}${OF_PLACE}`,
  'gu',
);

/** Plausible graduation years. Only searched inside the Education section. */
const YEAR = /(?<!\d)(?:19[5-9]\d|20[0-4]\d)(?!\d)/g;

/** A letter, digit or underscore on either side means the name is part of a longer word. */
const NOT_WORD_BEFORE = String.raw`(?<![\p{L}\p{N}_])`;
const NOT_WORD_AFTER = String.raw`(?![\p{L}\p{N}_])`;
/** Suffixes and credentials that aren't the person's name and appear in ordinary text ("Jr. Developer"). */
const NAME_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'phd', 'md', 'mba', 'esq']);
/** Every name variant maps to one key, so the person is always `[PERSON_1]`. */
const PERSON_KEY = 'person';

/**
 * Finds email addresses.
 *
 * @example
 * detectEmails('mail a@example.com'); // [{ type: 'EMAIL', start: 5, end: 18, key: 'a@example.com' }]
 */
export function detectEmails(text: string): PiiMatch[] {
  return collect(text, EMAIL, 'EMAIL', (value) => value.toLowerCase());
}

/**
 * Finds `http(s)://` and `www.` URLs, and LinkedIn and GitHub profile links without a scheme.
 * Trailing sentence punctuation is left out of the match.
 *
 * @example
 * detectUrls('see github.com/gsilva.'); // [{ type: 'URL', start: 4, end: 21, key: 'github.com/gsilva' }]
 */
export function detectUrls(text: string): PiiMatch[] {
  return collect(text, URL, 'URL', urlKey).map((match) => {
    const value = text.slice(match.start, match.end);
    const trimmed = value.replace(URL_TRAILING_PUNCTUATION, '');
    return { ...match, end: match.start + trimmed.length, key: urlKey(trimmed) };
  });
}

/**
 * Finds US and international phone numbers.
 *
 * @example
 * detectPhones('(415) 555-0142'); // [{ type: 'PHONE', start: 0, end: 14, key: '4155550142' }]
 */
export function detectPhones(text: string): PiiMatch[] {
  return [
    ...collect(text, US_PHONE, 'PHONE', phoneKey),
    ...collect(text, INTERNATIONAL_PHONE, 'PHONE', phoneKey).filter(
      (match) => match.key.length >= PHONE_DIGITS.min && match.key.length <= PHONE_DIGITS.max,
    ),
  ];
}

/**
 * Finds US street lines (`742 Evergreen Terrace, Apt 4`) and `City, ST 12345` lines. A street
 * followed by its city is one entity.
 *
 * @example
 * detectAddresses('742 Evergreen Terrace'); // [{ type: 'ADDRESS', start: 0, end: 21, … }]
 */
export function detectAddresses(text: string): PiiMatch[] {
  return collect(text, ADDRESS, 'ADDRESS', collapsedKey);
}

/**
 * Finds institution names. Call it on the Education section only (SPEC §9.3).
 *
 * @example
 * detectSchools('B.A., University of Westbrook'); // [{ type: 'SCHOOL', start: 6, … }]
 */
export function detectSchools(section: string): PiiMatch[] {
  return collect(section, SCHOOL, 'SCHOOL', collapsedKey);
}

/**
 * Finds four-digit years, an age proxy. Call it on the Education section only (SPEC §9.3).
 *
 * @example
 * detectGraduationYears('2014–2018'); // two matches, keys '2014' and '2018'
 */
export function detectGraduationYears(section: string): PiiMatch[] {
  return collect(section, YEAR, 'GRAD_YEAR', (value) => value);
}

/**
 * Finds the header name and its parts, case-insensitively and only as whole words. Initials,
 * generational suffixes and credentials are skipped, because they match ordinary text.
 *
 * @example
 * detectPerson("Priya's RFC", 'Priya Raman'); // [{ type: 'PERSON', start: 0, end: 5, key: 'person' }]
 */
export function detectPerson(text: string, personName: string): PiiMatch[] {
  const variants = nameVariants(personName);
  if (variants.length === 0) {
    return [];
  }
  const alternatives = variants.map(namePattern).join('|');
  const pattern = new RegExp(`${NOT_WORD_BEFORE}(?:${alternatives})${NOT_WORD_AFTER}`, 'giu');
  return collect(text, pattern, 'PERSON', () => PERSON_KEY);
}

/** The full name (credentials after a comma dropped) and each part of it, longest first. */
function nameVariants(personName: string): string[] {
  const fullName = (personName.split(',')[0] ?? '').trim();
  const parts = fullName
    .split(/\s+/)
    .map((part) => part.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ''))
    .filter((part) => /\p{L}{2,}/u.test(part) && !NAME_SUFFIXES.has(part.toLowerCase()));
  const variants = new Set([fullName, ...parts].filter((variant) => /\p{L}{2,}/u.test(variant)));
  return [...variants].sort((a, b) => b.length - a.length);
}

/** A literal name as a pattern: any run of whitespace between words, either apostrophe style. */
function namePattern(name: string): string {
  return name
    .replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
    .replace(/['’]/g, "['’]")
    .replace(/\s+/g, String.raw`\s+`);
}

function collect(
  text: string,
  pattern: RegExp,
  type: PiiType,
  toKey: (value: string) => string,
): PiiMatch[] {
  return [...text.matchAll(pattern)].map((match) => ({
    type,
    start: match.index,
    end: match.index + match[0].length,
    key: toKey(match[0]),
  }));
}

function urlKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');
}

function phoneKey(value: string): string {
  const digits = value.replace(/\D/g, '');
  return NANP_WITH_COUNTRY_CODE.exec(digits)?.[1] ?? digits;
}

function collapsedKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ');
}
