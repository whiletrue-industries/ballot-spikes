// Downloads (or reads) the Central Elections Committee per-ballot-box CSV and writes data/k26.json.
// Usage: pnpm results [url-or-file]
//   default source: $RESULTS_URL or https://media26.bechirot.gov.il/files/expb.csv
// List names, letters and surplus agreements come from data/k26-lists.json (hand-maintained).
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const src = process.argv[2] ?? process.env.RESULTS_URL ?? 'https://media26.bechirot.gov.il/files/expb.csv';
const meta = JSON.parse(readFileSync('data/k26-lists.json', 'utf8')) as {
	eligible: number;
	agreements: [string, string][];
	lists: { letters: string; name: string; fullName?: string }[];
};

async function load(): Promise<Uint8Array> {
	if (existsSync(src)) return readFileSync(src);
	const res = await fetch(src, { headers: { 'User-Agent': 'Mozilla/5.0 (ballot-spikes)' } });
	if (!res.ok) throw new Error(`${src}: HTTP ${res.status}`);
	if ((res.headers.get('content-type') ?? '').includes('text/html')) throw new Error(`${src}: got an HTML page, not CSV`);
	const buf = new Uint8Array(await res.arrayBuffer());
	mkdirSync('data/raw', { recursive: true });
	writeFileSync(`data/raw/expb-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`, buf);
	return buf;
}

function decode(buf: Uint8Array): string {
	const utf8 = new TextDecoder('utf-8').decode(buf);
	return utf8.includes('�') ? new TextDecoder('windows-1255').decode(buf) : utf8.replace(/^﻿/, '');
}

const NON_LIST = new Set(['בזב', 'קלפי', 'שופט', 'ריכוז', 'ברזל', 'מצביעים', 'פסולים', 'כשרים']);

const text = decode(await load());
const rows = text.trim().split(/\r?\n/).map((r) => r.split(','));
const header = rows[0].map((h) => h.trim().replace(/^"|"$/g, ''));
const col = (name: string) => header.indexOf(name);
const listCols = header
	.map((h, i) => ({ h, i }))
	.filter(({ h }) => /^[א-ת"׳']{1,4}$/.test(h) && !NON_LIST.has(h));
if (!listCols.length) throw new Error(`no list columns found in header: ${header.join(',')}`);

const sum = (i: number) => rows.slice(1).reduce((s, r) => s + (Number(r[i]) || 0), 0);
const totals = Object.fromEntries(listCols.map(({ h, i }) => [h, sum(i)]));
const eligibleCounted = col('בזב') >= 0 ? sum(col('בזב')) : 0;

const known = new Map(meta.lists.map((l) => [l.letters, l.name]));
const fullNames = new Map(meta.lists.map((l) => [l.letters, l.fullName ?? l.name]));
const unknown = listCols.map((c) => c.h).filter((h) => !known.has(h));
if (unknown.length) console.warn(`lists missing from data/k26-lists.json (shown by letters only): ${unknown.join(' ')}`);

// Lists under 1% are grouped into one "others" spike for display; they never affect seats.
const valid = Object.values(totals).reduce((a, b) => a + b, 0);
const big = Object.entries(totals).filter(([, v]) => v >= valid * 0.01).sort((a, b) => b[1] - a[1]);
const small = Object.entries(totals).filter(([, v]) => v < valid * 0.01);

const out = {
	knesset: 26,
	date: '2026-10-27',
	status: 'partial',
	source: 'ועדת הבחירות המרכזית — תוצאות אמת חלקיות',
	fetchedAt: process.env.FETCHED_AT ?? new Date().toISOString(),
	officialTime: existsSync('data/raw/official-time.txt') ? readFileSync('data/raw/official-time.txt', 'utf8').trim() || null : null,
	countedPercent: meta.eligible ? Math.round((eligibleCounted / meta.eligible) * 1000) / 10 : null,
	ballotBoxes: rows.length - 1,
	eligible: meta.eligible,
	invalid: col('פסולים') >= 0 ? sum(col('פסולים')) : null,
	lists: [
		...big.map(([id, votes]) => ({ id, letters: id, name: known.get(id) ?? id, fullName: fullNames.get(id) ?? id, votes })),
		...(small.length
			? [{ id: 'others', letters: '', name: `עוד ${small.length} רשימות`, votes: small.reduce((s, [, v]) => s + v, 0), group: true, count: small.length }]
			: [])
	],
	agreements: meta.agreements
};
writeFileSync('data/k26.json', JSON.stringify(out, null, 1));
console.log(`k26: ${out.ballotBoxes} ballot boxes, ${valid.toLocaleString('he-IL')} valid votes, ~${out.countedPercent}% counted`);
