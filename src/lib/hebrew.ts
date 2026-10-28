// Hebrew one-letter prefixes. ל/ב/כ absorb the definite article: ל + הליכוד → לליכוד,
// while מ/ש/ו keep it: מ + הליכוד → מהליכוד.
export function prefixed(prefix: string, word: string): string {
	return /[לבכ]$/.test(prefix) && word.startsWith('ה') ? prefix + word.slice(1) : prefix + word;
}

/** "א, ב וג" — optionally with a prefix on every item: ("ל") → "לא, לב ולג". */
export function joinHe(words: string[], prefix = ''): string {
	const w = words.map((x) => prefixed(prefix, x));
	return w.length <= 1 ? w.join('') : `${w.slice(0, -1).join(', ')} ${prefixed('ו', w.at(-1)!)}`;
}
