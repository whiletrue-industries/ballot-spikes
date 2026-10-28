// Downloads the committee's per-ballot-box CSV using the locally installed Google Chrome.
// The file is only served to real browsers, so plain HTTP clients (and CI runners) get a 404.
// Usage: tsx scripts/download-results.ts [out=data/raw/expb.csv]
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const out = process.argv[2] ?? 'data/raw/expb.csv';
const SITE = 'https://votes26.bechirot.gov.il/nationalresults?lang=he';
const CSV = 'https://media26.bechirot.gov.il/files/expb.csv?';

// Headless Chrome is refused by the site, so this opens a real Chrome window, parked off-screen.
const browser = await chromium.launch({
	channel: 'chrome',
	headless: false,
	args: ['--window-position=-3000,-3000', '--window-size=900,700']
});
try {
	const page = await browser.newPage({ acceptDownloads: true });
	await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60_000 });
	const official = await page
		.locator('text=/תוצאות נכון ל/')
		.first()
		.textContent({ timeout: 10_000 })
		.catch(() => null);
	// the committee serves the CSV as a download; let Chrome download it like a person clicking the button
	const [download] = await Promise.all([
		page.waitForEvent('download', { timeout: 120_000 }),
		page.evaluate((url) => {
			const a = document.createElement('a');
			a.href = url;
			a.download = 'expb.csv';
			document.body.appendChild(a);
			a.click();
		}, CSV)
	]);
	const text = new TextDecoder('utf-8').decode(readFileSync((await download.path())!)).replace(/^\uFEFF/, '');
	if (!text.startsWith('סמל ועדה')) throw new Error(`unexpected content: ${text.slice(0, 120)}`);
	mkdirSync(dirname(out), { recursive: true });
	writeFileSync(out, text);
	writeFileSync(`${dirname(out)}/official-time.txt`, official?.replace(/.*נכון ל-?\s*/, '').trim() ?? '');
	console.log(`saved ${out} (${text.length} chars, ${text.trim().split('\n').length - 1} ballot boxes); site says: ${official?.trim()}`);
} finally {
	await browser.close();
}
