// Builds src/lib/data/election.json: raw results + full allocation log + per-list sensitivity.
// Usage: pnpm data            (uses data/k26.json if present, else data/k25.json)
//        ELECTION=k25 pnpm data
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { allocate } from '../src/lib/election/allocate';
import { sensitivity } from '../src/lib/election/sensitivity';

const name = process.env.ELECTION ?? (existsSync('data/k26.json') ? 'k26' : 'k25');
const raw = JSON.parse(readFileSync(`data/${name}.json`, 'utf8'));
const input = {
	lists: raw.lists.map((l: { id: string; votes: number }) => ({ id: l.id, votes: l.votes })),
	agreements: raw.agreements
};

const t0 = Date.now();
const allocation = allocate(input);
const sens = Object.fromEntries(
	raw.lists.filter((l: { group?: boolean }) => !l.group).map((l: { id: string }) => [l.id, sensitivity(input, l.id)])
);

mkdirSync('src/lib/data', { recursive: true });
writeFileSync('src/lib/data/election.json', JSON.stringify({ ...raw, allocation, sensitivity: sens }));
console.log(`${name}: ${raw.lists.length} lists, built in ${Date.now() - t0}ms`);
for (const l of raw.lists) {
	const s = sens[l.id];
	if (!s) continue;
	console.log(
		`${l.letters.padEnd(4)} ${String(allocation.seats[l.id]).padStart(3)}  ` +
			(s.passed ? `-${s.removeToChange} → ${JSON.stringify(s.changesOnRemove)}` : `missing ${s.missingToPass}`)
	);
}
