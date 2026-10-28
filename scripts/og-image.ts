// Renders static/og.jpg (1200×630) from the site's own title screen.
// Usage: pnpm dev (or preview), then: tsx scripts/og-image.ts [url=http://localhost:5173/]
import { chromium } from 'playwright-core';

const url = process.argv[2] ?? 'http://localhost:5173/';
const browser = await chromium.launch({ channel: 'chrome' });
try {
	const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
	await page.goto(url, { waitUntil: 'networkidle' });
	await page.waitForTimeout(2500); // fonts + slip textures
	await page.evaluate(() => {
		document.querySelector<HTMLElement>('.letterhead')!.style.display = 'none';
		document.querySelector<HTMLElement>('.scroll-hint')!.style.display = 'none';
		// timeless subtitle (the live one carries a vote count that changes with the count)
		document.querySelector('.hero .lede')!.textContent =
			'איך הפתקים בקלפי הופכים ל־120 חברי כנסת — אחוז החסימה, הסכמי העודפים ושיטת באדר־עופר, צעד אחר צעד.';
		const hero = document.querySelector<HTMLElement>('.card.hero')!;
		hero.style.transform = 'rotate(-1.5deg) scale(1.08)';
	});
	await page.waitForTimeout(400);
	await page.screenshot({ path: 'static/og.jpg', type: 'jpeg', quality: 85 });
	console.log('wrote static/og.jpg');
} finally {
	await browser.close();
}
