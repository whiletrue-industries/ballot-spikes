import raw from './election.json';
import type { Allocation } from '$lib/election/allocate';
import type { Sensitivity } from '$lib/election/sensitivity';

export interface List {
	id: string;
	letters: string;
	name: string;
	fullName?: string;
	votes: number;
	group?: boolean;
}

export interface Election {
	knesset: number;
	date: string;
	status: 'final' | 'partial';
	source: string;
	fetchedAt?: string;
	countedPercent: number | null;
	eligible: number;
	invalid: number | null;
	lists: List[];
	agreements: [string, string][];
	allocation: Allocation;
	sensitivity: Record<string, Sensitivity>;
}

export const election = raw as unknown as Election;

// Printing-ink palette (Kalpi style), used only where lists need telling apart (the Knesset arc).
const INKS = [
	0x2f5da8, 0xb3261e, 0x3d6b4f, 0xc77d1a, 0x5b3f8c, 0x1f7a8c, 0x8c2f5b, 0x6b5a2f, 0x2f8c5b, 0xa84f2f, 0x4f4f8c,
	0x7a7a1f, 0x8c5b3f, 0x555555
];
export const inkOf = (id: string) => {
	const i = election.lists.findIndex((l) => l.id === id);
	return INKS[i % INKS.length];
};

export const listById = Object.fromEntries(election.lists.map((l) => [l.id, l])) as Record<string, List>;

const nf = new Intl.NumberFormat('he-IL');
export const fmt = (n: number) => nf.format(Math.round(n));
export const pct = (n: number, d = 2) => `${n.toFixed(d)}%`;
