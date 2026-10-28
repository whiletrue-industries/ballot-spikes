// "How many votes would have changed the result?" — computed by brute force,
// re-running the allocation with fewer (or more) votes for one list.
import { seatsOnly, THRESHOLD, type ElectionInput } from './allocate';

export interface SeatChange {
	id: string;
	delta: number;
}

export interface Sensitivity {
	id: string;
	passed: boolean;
	/** Smallest number of votes that, removed from this list, changes any seat. */
	removeToChange: number | null;
	changesOnRemove: SeatChange[];
	/** Smallest number of votes that, added to this list, changes any seat. */
	addToChange: number | null;
	changesOnAdd: SeatChange[];
	/** For lists below the threshold: votes missing to pass it. */
	missingToPass: number | null;
	/** Smallest number of votes that, added to this list, gives it (or its surplus-agreement pair) another seat. */
	addToGain: number | null;
	changesOnGain: SeatChange[];
}

function diff(a: Record<string, number>, b: Record<string, number>): SeatChange[] {
	const out: SeatChange[] = [];
	for (const id of Object.keys(a)) if (a[id] !== b[id]) out.push({ id, delta: b[id] - a[id] });
	return out.sort((x, y) => x.delta - y.delta);
}

function withVotes(input: ElectionInput, id: string, delta: number): ElectionInput {
	return { ...input, lists: input.lists.map((l) => (l.id === id ? { ...l, votes: l.votes + delta } : l)) };
}

function scan(input: ElectionInput, id: string, sign: 1 | -1, limit: number) {
	const base = seatsOnly(input);
	for (let k = 1; k <= limit; k++) {
		const changes = diff(base, seatsOnly(withVotes(input, id, sign * k)));
		if (changes.length) return { k, changes };
	}
	return null;
}

/** The list plus its surplus-agreement partner (an agreement only counts if both pass, which the allocation handles). */
function groupOf(input: ElectionInput, id: string): string[] {
	const ag = input.agreements.find((a) => a.includes(id));
	return ag ? [...ag] : [id];
}

function scanGain(input: ElectionInput, id: string, limit: number) {
	const group = groupOf(input, id);
	const base = seatsOnly(input);
	const total = (seats: Record<string, number>) => group.reduce((s, g) => s + (seats[g] ?? 0), 0);
	const before = total(base);
	for (let k = 1; k <= limit; k++) {
		const seats = seatsOnly(withVotes(input, id, k));
		if (total(seats) > before) return { k, changes: diff(base, seats) };
	}
	return null;
}

export function sensitivity(input: ElectionInput, id: string): Sensitivity {
	const list = input.lists.find((l) => l.id === id)!;
	const valid = input.lists.reduce((s, l) => s + l.votes, 0);
	const t = input.threshold ?? THRESHOLD;
	const passed = list.votes >= valid * t;

	// Adding x votes raises the total too: need v + x >= t * (valid + x).
	let missingToPass: number | null = null;
	if (!passed) {
		missingToPass = Math.ceil((t * valid - list.votes) / (1 - t));
		while (list.votes + missingToPass < t * (valid + missingToPass)) missingToPass++;
	}

	const quota = valid / (input.seats ?? 120);
	const rem = scan(input, id, -1, Math.min(list.votes, Math.ceil(quota * 2)));
	const add = scan(input, id, 1, missingToPass ?? Math.ceil(quota * 2));
	const gain = scanGain(input, id, missingToPass ?? Math.ceil(quota * 2));

	return {
		id,
		passed,
		removeToChange: rem?.k ?? null,
		changesOnRemove: rem?.changes ?? [],
		addToChange: add?.k ?? null,
		changesOnAdd: add?.changes ?? [],
		missingToPass,
		addToGain: gain?.k ?? null,
		changesOnGain: gain?.changes ?? []
	};
}
