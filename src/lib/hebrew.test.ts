import { describe, expect, it } from 'vitest';
import { joinHe, prefixed } from './hebrew';

describe('Hebrew prefixes', () => {
	it('ל/ב/כ absorb the definite article', () => {
		expect(prefixed('ל', 'הרשימה המשותפת')).toBe('לרשימה המשותפת');
		expect(prefixed('ב', 'הליכוד')).toBe('בליכוד');
		expect(prefixed('ול', 'הדמוקרטים')).toBe('ולדמוקרטים');
	});
	it('מ/ש/ו keep it, and words without ה are untouched', () => {
		expect(prefixed('מ', 'הליכוד')).toBe('מהליכוד');
		expect(prefixed('ו', 'הרשימה המשותפת')).toBe('והרשימה המשותפת');
		expect(prefixed('ל', 'ישר!')).toBe('לישר!');
	});
	it('joins lists with a prefix on every item', () => {
		expect(joinHe(['הליכוד', 'ש״ס', 'הדמוקרטים'], 'ל')).toBe('לליכוד, לש״ס ולדמוקרטים');
		expect(joinHe(['ביחד', 'הרשימה המשותפת'])).toBe('ביחד והרשימה המשותפת');
	});
});
