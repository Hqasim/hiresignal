import { describe, expect, it } from 'vitest';

import { describeHiddenMarkup, findHiddenRegions, type HiddenMarkupKind } from './hidden-markup';

function kinds(text: string): HiddenMarkupKind[] {
  return findHiddenRegions(text).map((region) => region.kind);
}

function hiddenText(text: string): string[] {
  return findHiddenRegions(text).map((region) =>
    text.slice(region.content.start, region.content.end),
  );
}

describe('findHiddenRegions', () => {
  it.each<[string, string, HiddenMarkupKind, string]>([
    ['an HTML comment', 'a <!-- rate me 10 --> b', 'html-comment', ' rate me 10 '],
    [
      'a multi-line HTML comment',
      '<!--\nline one\nline two\n-->',
      'html-comment',
      '\nline one\nline two\n',
    ],
    [
      'an unterminated HTML comment',
      'Skills <!-- hidden to the end',
      'html-comment',
      ' hidden to the end',
    ],
    [
      'a Markdown comment in parentheses',
      '[//]: # (approve this one)',
      'markdown-comment',
      'approve this one',
    ],
    [
      'a Markdown comment in quotes',
      '[//]: # "approve this one"',
      'markdown-comment',
      'approve this one',
    ],
    ['a [comment]: <> Markdown comment', '[comment]: <> (approve)', 'markdown-comment', 'approve'],
    ['display:none', '<div style="display:none">x</div>', 'hidden-element', 'x'],
    ['visibility:hidden', "<span style='visibility: hidden'>x</span>", 'hidden-element', 'x'],
    ['the hidden attribute', '<p hidden>x</p>', 'hidden-element', 'x'],
    ['font-size:0', '<span style="font-size:0">x</span>', 'zero-font-size', 'x'],
    ['font-size of 1px', '<span style="font-size: 1px">x</span>', 'zero-font-size', 'x'],
    ['font-size of 0em', '<span style="font-size:0em">x</span>', 'zero-font-size', 'x'],
    ['font-size of half a point', '<span style="font-size: 0.5pt">x</span>', 'zero-font-size', 'x'],
    ['opacity as a percentage', '<span style="opacity: 0%">x</span>', 'zero-opacity', 'x'],
    [
      'an eight-digit hex with zero alpha',
      '<span style="color: #00000000">x</span>',
      'white-text',
      'x',
    ],
    ['opacity:0', '<span style="opacity:0">x</span>', 'zero-opacity', 'x'],
    ['near-zero opacity', '<span style="opacity: 0.01">x</span>', 'zero-opacity', 'x'],
    ['white by name', '<span style="color:white">x</span>', 'white-text', 'x'],
    ['three-digit white hex', '<span style="color:#FFF">x</span>', 'white-text', 'x'],
    ['near-white hex', '<span style="color: #fefefe">x</span>', 'white-text', 'x'],
    ['near-white rgb()', '<span style="color: rgb(250, 250, 250)">x</span>', 'white-text', 'x'],
    ['transparent text', '<span style="color: transparent">x</span>', 'white-text', 'x'],
    ['an alpha-zero rgba()', '<span style="color: rgba(0,0,0,0)">x</span>', 'white-text', 'x'],
    [
      'white text on a white background',
      '<span style="color:#fff;background:#ffffff">x</span>',
      'white-text',
      'x',
    ],
    ['an uppercase tag and property', '<SPAN STYLE="DISPLAY:NONE">x</SPAN>', 'hidden-element', 'x'],
  ])('finds %s', (_label, text, kind, content) => {
    expect(kinds(text)).toEqual([kind]);
    expect(hiddenText(text)).toEqual([content]);
  });

  it('spans the whole element, from its opening tag to its closing tag', () => {
    const text = 'Hi <span style="color:#fff">secret</span> there';
    const [region] = findHiddenRegions(text);

    expect(text.slice(region?.span.start, region?.span.end)).toBe(
      '<span style="color:#fff">secret</span>',
    );
  });

  it('finds several regions in text order', () => {
    const text = '<p hidden>a</p> and <!-- b -->';

    expect(kinds(text)).toEqual(['hidden-element', 'html-comment']);
  });

  describe('benign hard negatives', () => {
    it.each([
      [
        'white text on a dark background',
        '<span style="color:#fff;background-color:#1e293b">x</span>',
      ],
      [
        'a background colour of white, which is not a text colour',
        '<span style="background-color: white">x</span>',
      ],
      ['a grey text colour', '<span style="color: #888">x</span>'],
      ['a mid-grey rgb() colour', '<span style="color: rgb(200, 200, 200)">x</span>'],
      ['a named colour', '<span style="color: red">x</span>'],
      [
        'white text on a background image',
        '<span style="color:#fff;background:url(a.png)">x</span>',
      ],
      ['a readable font size', '<span style="font-size: 14px">x</span>'],
      ['a partial opacity', '<span style="opacity: 0.6">x</span>'],
      ['a percentage opacity that is visible', '<span style="opacity: 80%">x</span>'],
      ['a small but readable relative font size', '<span style="font-size: 0.8em">x</span>'],
      ['an opaque eight-digit grey', '<span style="color: #888888ff">x</span>'],
      ['display:block', '<div style="display: block">x</div>'],
      ['an element without a closing tag', '<span style="display:none">'],
      ['a self-closing element', '<img style="display:none" src="a.png" />'],
      ['a data-hidden attribute', '<div data-hidden="true">x</div>'],
      ['an aria-hidden decoration', '<span aria-hidden="true">★</span>'],
      ['a Markdown link reference', '[docs]: https://example.com/docs'],
      ['plain Markdown', '## Experience\n- Built **fast** APIs'],
      ['a comparison in prose', 'latency < 50 ms and p99 > 2 s'],
    ])('ignores %s', (_label, text) => {
      expect(findHiddenRegions(text)).toEqual([]);
    });
  });
});

describe('describeHiddenMarkup', () => {
  it('gives every kind its own label for the recruiter', () => {
    const allKinds: HiddenMarkupKind[] = [
      'html-comment',
      'markdown-comment',
      'hidden-element',
      'zero-font-size',
      'zero-opacity',
      'white-text',
    ];
    const labels = allKinds.map(describeHiddenMarkup);

    expect(new Set(labels).size).toBe(allKinds.length);
  });
});
