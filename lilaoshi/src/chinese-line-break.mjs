// Atomic animated glyphs need explicit kinsoku groups; CSS alone cannot bind them.
const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });
const noStart = /^[，。、；：！？）》」』】〕〉〗〙〛”’…‥—～·,.!?:;%‰°℃)\]}]/u;
const noEnd = /[（《「『【〔〈〖〘〚“‘(\[{]$/u;
const latinOrNumber = /^[\p{Script=Latin}\p{Number}]$/u;
export function chineseTextRuns(value) {
  const groups = [];
  for (const {segment: glyph} of segmenter.segment(String(value))) {
    const previous = groups.at(-1);
    if (previous && (noStart.test(glyph) || noEnd.test(previous) || (latinOrNumber.test(glyph) && latinOrNumber.test([...previous].at(-1))))) groups[groups.length - 1] += glyph;
    else groups.push(glyph);
  }
  const runs = [];
  for (const group of groups) {
    const keep = [...segmenter.segment(group)].length > 1;
    // A punctuation-only fragment can occur after a rich-text concept button.
    // Render it as native inline text so it binds to the preceding inline content.
    const punctuation = noStart.test(group) && !keep;
    const previous = runs.at(-1);
    if (!keep && !punctuation && previous && !previous.keep && !previous.punctuation) previous.text += group;
    else runs.push({text: group, keep, punctuation});
  }
  return runs;
}
