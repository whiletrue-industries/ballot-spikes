// Knesset seat allocation: threshold, general quota, Bader-Ofer with surplus agreements.
// Pure functions, no DOM. Returns a step log so the story can replay the process.

export interface ListResult {
	id: string; // ballot letters, unique
	votes: number;
}

export interface ElectionInput {
	lists: ListResult[];
	agreements: [string, string][];
	seats?: number;
	threshold?: number;
}

export interface Entity {
	id: string; // list id, or "a+b" for a surplus pair
	members: string[];
	votes: number;
}

export interface SurplusStep {
	seat: number; // 1-based index of the seat in the whole Knesset
	candidates: { entity: string; votes: number; seats: number; ratio: number }[];
	winner: string;
}

export interface PairSplit {
	entity: string;
	members: string[];
	seats: number;
	quota: number;
	floor: Record<string, number>;
	steps: { candidates: { id: string; ratio: number }[]; winner: string }[];
}

export interface Allocation {
	validVotes: number;
	thresholdVotes: number;
	passed: string[];
	failed: string[];
	qualifyingVotes: number;
	quota: number;
	floorSeats: Record<string, number>;
	floorTotal: number;
	entities: Entity[];
	surplusSteps: SurplusStep[];
	entitySeats: Record<string, number>;
	pairSplits: PairSplit[];
	seats: Record<string, number>;
}

export const SEATS = 120;
export const THRESHOLD = 0.0325;

/** Bader-Ofer: repeatedly give a seat to the max votes/(seats+1). Ties go to the larger vote count. */
function baderOfer(
	items: { id: string; votes: number }[],
	seats: Record<string, number>,
	toGive: number,
	onStep?: (candidates: { id: string; votes: number; seats: number; ratio: number }[], winner: string) => void
) {
	for (let i = 0; i < toGive; i++) {
		let best: { id: string; votes: number; ratio: number } | null = null;
		const candidates = items.map((it) => {
			const ratio = it.votes / (seats[it.id] + 1);
			if (!best || ratio > best.ratio || (ratio === best.ratio && it.votes > best.votes)) {
				best = { id: it.id, votes: it.votes, ratio };
			}
			return { id: it.id, votes: it.votes, seats: seats[it.id], ratio };
		});
		const winner = (best as unknown as { id: string }).id;
		onStep?.(candidates, winner);
		seats[winner] += 1;
	}
}

export function allocate(input: ElectionInput, log = true): Allocation {
	const totalSeats = input.seats ?? SEATS;
	const threshold = input.threshold ?? THRESHOLD;
	const validVotes = input.lists.reduce((s, l) => s + l.votes, 0);
	const thresholdVotes = validVotes * threshold;

	const passedLists = input.lists.filter((l) => l.votes >= thresholdVotes);
	const passed = passedLists.map((l) => l.id);
	const failed = input.lists.filter((l) => l.votes < thresholdVotes).map((l) => l.id);
	const votesOf = Object.fromEntries(input.lists.map((l) => [l.id, l.votes]));

	const qualifyingVotes = passedLists.reduce((s, l) => s + l.votes, 0);
	const quota = qualifyingVotes / totalSeats;

	const floorSeats: Record<string, number> = {};
	for (const l of passedLists) floorSeats[l.id] = Math.floor(l.votes / quota);
	const floorTotal = Object.values(floorSeats).reduce((a, b) => a + b, 0);

	// Agreements count only when both lists passed the threshold.
	const pairOf: Record<string, string> = {};
	for (const [a, b] of input.agreements) {
		if (floorSeats[a] !== undefined && floorSeats[b] !== undefined) {
			pairOf[a] = b;
			pairOf[b] = a;
		}
	}
	const entities: Entity[] = [];
	const seen = new Set<string>();
	for (const id of passed) {
		if (seen.has(id)) continue;
		const partner = pairOf[id];
		const members = partner ? [id, partner] : [id];
		members.forEach((m) => seen.add(m));
		entities.push({ id: members.join('+'), members, votes: members.reduce((s, m) => s + votesOf[m], 0) });
	}

	const entitySeats: Record<string, number> = {};
	for (const e of entities) entitySeats[e.id] = e.members.reduce((s, m) => s + floorSeats[m], 0);

	const surplusSteps: SurplusStep[] = [];
	baderOfer(entities, entitySeats, totalSeats - floorTotal, log
		? (cands, winner) =>
				surplusSteps.push({
					seat: floorTotal + surplusSteps.length + 1,
					candidates: cands.map((c) => ({ entity: c.id, votes: c.votes, seats: c.seats, ratio: c.ratio })),
					winner
				})
		: undefined);

	const seats: Record<string, number> = {};
	const pairSplits: PairSplit[] = [];
	for (const e of entities) {
		if (e.members.length === 1) {
			seats[e.members[0]] = entitySeats[e.id];
			continue;
		}
		const pairSeats = entitySeats[e.id];
		const pairQuota = e.votes / pairSeats;
		const inner: Record<string, number> = {};
		for (const m of e.members) inner[m] = Math.floor(votesOf[m] / pairQuota);
		const floor = { ...inner };
		const given = Object.values(inner).reduce((a, b) => a + b, 0);
		const steps: PairSplit['steps'] = [];
		baderOfer(
			e.members.map((m) => ({ id: m, votes: votesOf[m] })),
			inner,
			pairSeats - given,
			log ? (cands, winner) => steps.push({ candidates: cands.map((c) => ({ id: c.id, ratio: c.ratio })), winner }) : undefined
		);
		Object.assign(seats, inner);
		pairSplits.push({ entity: e.id, members: e.members, seats: pairSeats, quota: pairQuota, floor, steps });
	}
	for (const id of failed) seats[id] = 0;

	return {
		validVotes,
		thresholdVotes,
		passed,
		failed,
		qualifyingVotes,
		quota,
		floorSeats,
		floorTotal,
		entities,
		surplusSteps,
		entitySeats,
		pairSplits,
		seats
	};
}

/** Fast path: seats only. */
export function seatsOnly(input: ElectionInput): Record<string, number> {
	return allocate(input, false).seats;
}
