import { describe, expect, it } from 'vitest';
import k25 from '../../../data/k25.json';
import { allocate } from './allocate';
import { sensitivity } from './sensitivity';

const input = {
	lists: k25.lists.map((l) => ({ id: l.id, votes: l.votes })),
	agreements: k25.agreements as [string, string][]
};

describe('Knesset 25 (official result)', () => {
	const a = allocate(input);

	it('reproduces the official seats', () => {
		expect(a.seats).toMatchObject({
			מחל: 32, פה: 24, ט: 14, כן: 12, שס: 11, ג: 7, ל: 6, עם: 5, ום: 5, אמת: 4, מרצ: 0, ד: 0, ב: 0
		});
		expect(Object.values(a.seats).reduce((x, y) => x + y, 0)).toBe(120);
	});

	it('drops the Labor–Meretz agreement because Meretz failed', () => {
		expect(a.entities.map((e) => e.id)).not.toContain('אמת+מרצ');
		expect(a.entities.map((e) => e.id)).toContain('מחל+ט');
	});

	it('logs one surplus step per remaining seat', () => {
		expect(a.surplusSteps.length).toBe(120 - a.floorTotal);
		expect(a.surplusSteps.at(-1)!.seat).toBe(120);
	});
});

describe('sensitivity', () => {
	it('is a tight boundary for a passing list', () => {
		const s = sensitivity(input, 'אמת');
		expect(s.passed).toBe(true);
		expect(s.removeToChange).toBeGreaterThan(0);
		const k = s.removeToChange!;
		const at = (d: number) =>
			allocate({ ...input, lists: input.lists.map((l) => (l.id === 'אמת' ? { ...l, votes: l.votes - d } : l)) }).seats;
		expect(at(k - 1)).toEqual(allocate(input).seats);
		expect(at(k)).not.toEqual(allocate(input).seats);
	});

	it('reports votes missing to pass for a failed list', () => {
		const s = sensitivity(input, 'מרצ');
		expect(s.passed).toBe(false);
		expect(s.missingToPass).toBeGreaterThan(3000);
		expect(s.missingToPass).toBeLessThan(5000);
	});
});
