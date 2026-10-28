<script lang="ts">
	import { onMount } from 'svelte';
	import { election as e, fmt, pct, listById, inkOf, listCount } from '$lib/data/election';
	import history from '$lib/data/history.json';
	import { BLANK, surplusAwarded, type Step } from '$lib/story/timeline';
	import type { Stage } from '$lib/stage/Stage';
	import { joinHe, prefixed } from '$lib/hebrew';
	import '$lib/styles.css';

	const SITE = 'https://whiletrue-industries.github.io/ballot-spikes/';
	const description = `סיפור בגלילה: איך הפתקים בקלפי הופכים ל־120 חברי כנסת — אחוז החסימה, המודד, הסכמי העודפים ושיטת באדר־עופר, לפי תוצאות הבחירות לכנסת ה־${e.knesset}. ובסוף: כמה הקול שלכם היה שווה.`;
	const a = e.allocation;
	const K = e.knesset;
	const lists = e.lists.filter((l) => !l.group);
	const failed = a.failed.map((id) => listById[id]);
	const wasted = failed.reduce((s, l) => s + l.votes, 0);
	const failedCount = failed.reduce((s, l) => s + listCount(l), 0);
	const ranCount = e.lists.reduce((s, l) => s + listCount(l), 0);
	const surplusN = a.surplusSteps.length;
	const pairs = a.entities.filter((x) => x.members.length > 1);
	const dropped = e.agreements.filter(([x, y]) => !pairs.some((p) => p.members.includes(x) && p.members.includes(y)));
	const nameOf = (id: string) => listById[id]?.name ?? id;
	const entityName = (id: string) => id.split('+').map(nameOf).join(' + ');
	const elected = e.lists.filter((l) => a.seats[l.id] > 0);
	const hist = history.elections;
	const maxTurnout = 100;
	const votesPerSlip = [1000, 2000, 2500, 5000, 10000, 20000].find((k) => a.validVotes / k <= 1100) ?? 20000;

	let step = $state<Step>('title');
	let p = $state<number>(0);
	let pick = $state<string | null>(null);
	let stageEl: HTMLDivElement;
	let stage: Stage | null = null;

	$effect(() => {
		// read the state unconditionally so the effect tracks it even before the stage exists
		const state = { step, p, pick };
		stage?.set(state);
	});

	function choose(id: string) {
		pick = id;
		rememberPick(id);
	}
	function rememberPick(id: string) {
		const url = new URL(location.href);
		url.hash = `pick=${encodeURIComponent(id)}`;
		window.history.replaceState(null, '', url);
	}

	const asOf = e.fetchedAt
		? new Date(e.fetchedAt).toLocaleString('he-IL', {
				timeZone: 'Asia/Jerusalem',
				day: 'numeric',
				month: 'numeric',
				year: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			})
		: null;

	const picked = $derived(pick && pick !== BLANK ? listById[pick] : null);
	const sens = $derived(pick && pick !== BLANK ? e.sensitivity[pick] : null);
	const awarded = $derived(step === 'bader' ? surplusAwarded(p, surplusN) : 0);
	const current = $derived(a.surplusSteps[Math.max(0, awarded - 1)]);

	const lost = $derived(sens ? sens.changesOnRemove.filter((c) => c.delta < 0) : []);
	const gained = $derived(sens ? sens.changesOnRemove.filter((c) => c.delta > 0) : []);
	const addLost = $derived(sens ? sens.changesOnAdd.filter((c) => c.delta < 0) : []);
	const addGained = $derived(sens ? sens.changesOnAdd.filter((c) => c.delta > 0) : []);
	const belowThreshold = $derived(!!picked && lost.some((c) => c.id === picked.id && c.delta === -a.seats[picked.id]));
	const seatsWord = (n: number) => (n === 1 ? 'מנדט' : `${n} מנדטים`);

	onMount(() => {
		const m = location.hash.match(/pick=([^&]+)/);
		if (m) {
			const id = decodeURIComponent(m[1]);
			if (id === BLANK || listById[id]) pick = id;
		}
		let cleanup = () => {};
		(async () => {
			const [{ Stage }, { gsap }, { ScrollTrigger }] = await Promise.all([
				import('$lib/stage/Stage'),
				import('gsap'),
				import('gsap/ScrollTrigger')
			]);
			gsap.registerPlugin(ScrollTrigger);
			// mobile browser chrome (address bar) resizing the viewport shouldn't re-measure every trigger
			ScrollTrigger.config({ ignoreMobileResize: true });
			const mobile = window.matchMedia('(max-width: 819px)').matches;
			const line = mobile ? 'top 80%' : 'top 70%';
			stage = await Stage.create(stageEl, e);
			if (import.meta.env.DEV) (window as unknown as { stage: Stage }).stage = stage;
			stage.set({ step, p, pick });
			const triggers = [...document.querySelectorAll<HTMLElement>('[data-step]')].map((el) =>
				ScrollTrigger.create({
					trigger: el,
					start: line,
					end: line.replace('top', 'bottom'),
					onUpdate: (self) => {
						if (!self.isActive) return;
						step = el.dataset.step as Step;
						p = self.progress;
					},
					onToggle: (self) => {
						el.classList.toggle('active', self.isActive);
						if (self.isActive) step = el.dataset.step as Step;
					}
				})
			);
			cleanup = () => {
				triggers.forEach((t) => t.kill());
				stage?.destroy();
			};
		})();
		return () => cleanup();
	});
</script>

<svelte:head>
	<title>מפתק למנדט — איך קולות הופכים למנדטים</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={SITE} />
	<meta property="og:type" content="website" />
	<meta property="og:locale" content="he_IL" />
	<meta property="og:site_name" content="מפתק למנדט" />
	<meta property="og:title" content="מפתק למנדט — איך קולות הופכים למנדטים" />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={SITE} />
	<meta property="og:image" content="{SITE}og.jpg" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="פתקי הצבעה מפוזרים, ובמרכז הכותרת: מפתק למנדט" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="מפתק למנדט — איך קולות הופכים למנדטים" />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content="{SITE}og.jpg" />
</svelte:head>

<div class="stage" bind:this={stageEl} aria-hidden="true"></div>

<header class="letterhead">
	<span class="seal">מ</span>
	<span>מפתק למנדט · הבחירות לכנסת ה־{K}</span>
	<span class="asof">
		{#if asOf}התוצאות נכון ל־{asOf}{/if}
		{#if e.status === 'partial'}<span class="partial">חלקיות · {e.countedPercent ?? '?'}% נספרו</span>{/if}
	</span>
</header>

{#if step === 'bader' && awarded > 0 && current}
	<div class="ticker" aria-hidden="true">
		<span class="seatno">מנדט {current.seat}</span>
		<b>{entityName(current.winner)}</b>
		<span class="num">{fmt(current.candidates.find((c) => c.entity === current.winner)?.ratio ?? 0)}</span>
	</div>
{/if}

<main class="story">
	<section data-step="title" class="step title">
		<div class="card hero">
			<p class="kicker">ועדת הבחירות (לא באמת) מציגה</p>
			<h1>מפתק למנדט</h1>
			<p class="lede">
				איך {fmt(a.validVotes)} פתקים הופכים ל־120 חברי כנסת — צעד אחר צעד, לפי תוצאות הבחירות לכנסת ה־{K}.
			</p>
			<p class="scroll-hint">גללו למטה ↓</p>
		</div>
	</section>

	<section data-step="spikes" class="step">
		<div class="card">
			<h2>כל פתק — על השיפוד שלו</h2>
			<p>
				כשהקלפיות נסגרות, הפתקים נספרים. דמיינו שכל פתק ננעץ על שיפוד של הרשימה שלו. כמה שיותר קולות — הערימה
				גבוהה יותר.
			</p>
			<p class="note">כל פתק כאן מייצג {fmt(votesPerSlip)} קולות אמיתיים.</p>
		</div>
	</section>

	<section data-step="history" class="step">
		<div class="card">
			<h2>הרבה רשימות, מעט כיסאות</h2>
			<p>
				בכל מערכת בחירות מתמודדות עשרות רשימות, אבל רק {Math.min(...hist.map((h) => h.listsPassed))} עד
				{Math.max(...hist.map((h) => h.listsPassed))} נכנסות לכנסת.
			</p>
			<table class="history">
				<thead>
					<tr><th>כנסת</th><th>הצבעה</th><th>רשימות שעברו / התמודדו</th></tr>
				</thead>
				<tbody>
					{#each hist as h (h.knesset)}
						<tr>
							<td><b>{h.knesset}</b> <small>{h.year}</small></td>
							<td>
								<span class="num">{pct(h.turnout, 1)}</span>
								<span class="bar" style:width="{(h.turnout / maxTurnout) * 100}%"></span>
							</td>
							<td class="dots" aria-label="{h.listsPassed} מתוך {h.listsRan}">
								<span class="num">{h.listsPassed}/{h.listsRan}</span>
								<span class="dotrow">{#each Array(h.listsRan) as _, i (i)}<i class:on={i < h.listsPassed}></i>{/each}</span>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<section data-step="pick" class="step tall">
		<div class="card">
			<h2>ועכשיו — אתם</h2>
			<p>בחרו את הפתק ששמתם בקלפי (או שהייתם שמים). הבחירה לא נשלחת לשום מקום — היא נשארת בדפדפן שלכם.</p>
			<div class="ballots" role="radiogroup" aria-label="בחירת פתק">
				{#each lists as l (l.id)}
					<button
						class="ballot"
						class:chosen={pick === l.id}
						role="radio"
						aria-checked={pick === l.id}
						title={l.fullName ?? l.name}
						onclick={() => choose(l.id)}
					>
						<span class="letters">{l.letters}</span>
						<span class="name">{l.name}</span>
					</button>
				{/each}
				<button
					class="ballot blank"
					class:chosen={pick === BLANK}
					role="radio"
					aria-checked={pick === BLANK}
					onclick={() => choose(BLANK)}
				>
					<span class="name">פתק לבן</span>
				</button>
			</div>
		</div>
	</section>

	<section data-step="yours" class="step">
		<div class="card">
			{#if picked}
				<h2>הפתק שלכם ננעץ</h2>
				<p>
					הוא מצטרף לעוד {fmt(picked.votes - 1)} פתקים של <b>{picked.name}</b>. מכאן והלאה, נעקוב אחריו (הוא הכחול).
				</p>
			{:else if pick === BLANK}
				<h2>פתק לבן</h2>
				<p>
					פתק לבן נספר כפתק <b>פסול</b>. הוא נכנס לאחוז ההצבעה, אבל לא לקולות הכשרים — ולכן הוא לא משפיע על חלוקת
					המנדטים. בבחירות האלה היו {fmt(e.invalid ?? 0)} פתקים פסולים.
				</p>
			{:else}
				<h2>עוד לא בחרתם</h2>
				<p>זה בסדר. אפשר לגלול חזרה ולבחור פתק בכל רגע — הסוף של הסיפור תלוי בזה.</p>
			{/if}
		</div>
	</section>

	<section data-step="threshold" class="step">
		<div class="card">
			<h2>אחוז החסימה</h2>
			<p>
				רשימה שקיבלה פחות מ־<b>3.25%</b> מהקולות הכשרים לא נכנסת לכנסת. בבחירות האלה הקו עבר ב־<b
					>{fmt(a.thresholdVotes)}</b
				> קולות.
			</p>
			<p>
				{failedCount} מתוך {ranCount} הרשימות שהתמודדו לא עברו. {fmt(wasted)} קולות — {pct((wasted / a.validVotes) * 100, 1)} מהקולות הכשרים —
				לא יהפכו לאף מנדט.
			</p>
			{#if picked && a.failed.includes(picked.id)}
				<p class="aside">גם הפתק שלכם נפל כאן. נחזור אליו בסוף.</p>
			{/if}
		</div>
	</section>

	<section data-step="quota" class="step tall">
		<div class="card">
			<h2>המודד: כמה עולה מנדט</h2>
			<p>
				עכשיו סופרים רק את הקולות של הרשימות שעברו — {fmt(a.qualifyingVotes)}. מחלקים ב־120 ומקבלים את
				<b>המודד הכללי</b>: {fmt(a.quota)} קולות למנדט.
			</p>
			<p>
				כל ערימה נחתכת לפרוסות בגודל המודד. כל פרוסה שלמה היא מנדט. כך מחולקים {a.floorTotal} מנדטים.
			</p>
			<p>
				מה שנשאר בראש כל ערימה (באדום) הם <b>העודפים</b> — קולות שלא הספיקו למנדט שלם. ונשארו עוד
				<b>{surplusN}</b> מנדטים לחלק.
			</p>
		</div>
	</section>

	<section data-step="agreements" class="step">
		<div class="card">
			<h2>הסכמי עודפים</h2>
			<p>
				לפני הבחירות רשימות יכולות לחתום, בזוגות, על הסכם עודפים. בחלוקת המנדטים שנשארו, כל זוג נחשב לרשימה אחת —
				והעודפים שלהן מתחברים.
			</p>
			<ul class="pairs">
				{#each pairs as pr (pr.id)}<li>{entityName(pr.id)}</li>{/each}
			</ul>
			{#each dropped as [x, y] (x + y)}
				<p class="aside">
					ההסכם בין {nameOf(x)} {prefixed('ל', nameOf(y))} התבטל: {a.failed.includes(x) ? nameOf(x) : nameOf(y)} לא עברה את אחוז החסימה.
				</p>
			{/each}
		</div>
	</section>

	<section data-step="bader" class="step xtall">
		<div class="card">
			<h2>שיטת באדר־עופר</h2>
			<p>
				איך מחלקים את {surplusN} המנדטים שנשארו? שואלים כל רשימה (או זוג): <i
					>אם תקבלו עוד מנדט אחד — כמה קולות יעמדו מאחורי כל מנדט שלכם?</i
				>
			</p>
			<p>המספר הכי גבוה מנצח ומקבל את המנדט. ואז שואלים שוב, עד שנגמרים.</p>
			<div class="live" aria-live="polite">
				{#if awarded > 0 && current}
					<div class="seatno">מנדט {current.seat}</div>
					<div class="winner">{entityName(current.winner)}</div>
					<ol>
						{#each [...current.candidates].sort((x, y) => y.ratio - x.ratio).slice(0, 4) as c (c.entity)}
							<li class:win={c.entity === current.winner}>
								<span>{entityName(c.entity)}</span>
								<span class="num">{fmt(c.votes)} ÷ {c.seats + 1} = {fmt(c.ratio)}</span>
							</li>
						{/each}
					</ol>
				{:else}
					<div class="seatno">מנדט {a.floorTotal + 1}…</div>
				{/if}
			</div>
		</div>
	</section>

	<section data-step="split" class="step flow">
		<div class="card">
			<h2>ובתוך הזוג</h2>
			<p>
				כל זוג מחלק את המנדטים שלו באותה שיטה, בקטן: קולות הזוג ÷ המנדטים שלו = <b>מודד הזוג</b>. כל רשימה מקבלת
				מנדט על כל מודד שלם, ומנדט שנשאר הולך לעודף הגדול.
			</p>
			<div class="pairsplits">
				{#each a.pairSplits as ps (ps.entity)}
					{@const effect = e.agreementEffects?.[ps.entity] ?? []}
					{@const won = effect.filter((c) => c.delta > 0)}
					{@const lostTo = effect.filter((c) => c.delta < 0)}
					<div class="ps">
						<div class="ps-head">
							<span>{entityName(ps.entity)}</span>
							<small>מודד <span class="num">{fmt(ps.quota)}</span></small>
							<b class="num">{ps.seats}</b>
						</div>
						{#each ps.members as m (m)}
							{@const extra = a.seats[m] - ps.floor[m]}
							<div class="ps-row" class:mine={pick === m}>
								<span>{nameOf(m)}</span>
								<small>{ps.floor[m]} שלמים{extra > 0 ? ` + ${extra} מהעודף` : ''}</small>
								<b class="num">{a.seats[m]}</b>
							</div>
						{/each}
						<div class="ps-note" class:hit={won.length > 0}>
							{#if won.length}
								בזכות ההסכם: {won.map((c) => `+${c.delta} ${prefixed('ל', nameOf(c.id))}`).join(', ')}{#if lostTo.length}, על
									חשבון {joinHe(lostTo.map((c) => nameOf(c.id)))}{/if}.
							{:else}
								בלי ההסכם — אותה תוצאה.
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<section data-step="knesset" class="step">
		<div class="card">
			<h2>הכנסת ה־{K}</h2>
			<ul class="legend">
				{#each elected as l (l.id)}
					<li class:mine={pick === l.id}>
						<i style:background="#{inkOf(l.id).toString(16).padStart(6, '0')}"></i>
						<span>{l.name}</span>
						<b class="num">{a.seats[l.id]}</b>
					</li>
				{/each}
			</ul>
		</div>
	</section>

	<section data-step="finale" class="step xtall">
		<div class="card finale">
			{#if picked && sens?.passed && sens.removeToChange}
				<h2>אז מה שווה קול אחד?</h2>
				<p>
					אילו {picked.name} הייתה מקבלת <b>{fmt(sens.removeToChange)}</b> קולות פחות,
					{joinHe(lost.map((c) => nameOf(c.id)))} {lost.length > 1 ? 'היו מאבדות' : 'הייתה מאבדת'}
					{seatsWord(-lost.reduce((s, c) => s + c.delta, 0))}{#if belowThreshold}&nbsp;— כי הייתה נופלת מתחת לאחוז החסימה{/if}{#if gained.length},
						{prefixed('ו', joinHe(gained.map((c) => nameOf(c.id))))}
						{gained.length > 1 ? 'היו מקבלות' : 'הייתה מקבלת'}
						{lost.reduce((s, c) => s - c.delta, 0) > 1 ? 'אותם' : 'אותו'}{/if}.
				</p>
				{#if !lost.some((c) => c.id === picked.id)}
					<p class="aside">
						שימו לב: המנדט לא היה נלקח {prefixed('מ', picked.name)} עצמה, אלא מהשותפה שלה בהסכם העודפים. הקולות של שתיהן נספרים יחד.
					</p>
				{/if}
				<p class="big">אתם אחד מ־{fmt(sens.removeToChange)} אנשים שעשו את ההבדל.</p>
				{#if sens.addToChange}
					<p>
						ובכיוון השני: עוד {fmt(sens.addToChange)} קולות היו מזיזים מנדט —
						{#if addGained.length}{joinHe(addGained.map((c) => nameOf(c.id)), 'ל')}{/if}{#if addLost.length}
							, על חשבון {joinHe(addLost.map((c) => nameOf(c.id)))}{/if}.
					</p>
				{/if}
			{:else if picked && sens && !sens.passed}
				<h2>הקול שלכם</h2>
				<p>
					{picked.name} קיבלה {fmt(picked.votes)} קולות. כדי לעבור את אחוז החסימה חסרו לה עוד
					<b>{fmt(sens.missingToPass ?? 0)}</b>.
				</p>
				<p class="big">{fmt(sens.missingToPass ?? 0)} אנשים נוספים היו משנים את הכנסת.</p>
				<p>
					הקולות שקיבלה לא הפכו למנדטים — אבל הם כן נספרו: כל קול כזה העלה מעט את אחוז החסימה לכל הרשימות האחרות.
				</p>
			{:else if pick === BLANK}
				<h2>הקול שלכם</h2>
				<p>פתק לבן לא מזיז אף מנדט. אבל הוא כן אומר משהו: הגעתם, ולא מצאתם את מי לבחור.</p>
				<p class="big">גם זה נספר — באחוז ההצבעה.</p>
			{:else}
				<h2>ומה עם הקול שלכם?</h2>
				<p>גללו חזרה ובחרו פתק — ונראה לכם כמה קולות הפרידו בין התוצאה הזאת לתוצאה אחרת.</p>
			{/if}
		</div>
	</section>

	<section data-step="end" class="step">
		<div class="card colophon">
			<h3>על הנתונים</h3>
			<p>
				{e.source}{#if asOf}, התוצאות נכון ל־<bdi>{asOf}</bdi>{/if}{#if e.officialTime}{' '}(עדכון ועדת
					הבחירות: <bdi>{e.officialTime}</bdi>){/if}. החישוב לפי חוק
				הבחירות לכנסת: אחוז חסימה 3.25%, מודד כללי, הסכמי עודפים (רק בין רשימות שעברו) ושיטת באדר־עופר.
			</p>
			<p>האתר הוא פרויקט עצמאי ואינו קשור לוועדת הבחירות המרכזית.</p>
			<p class="credit">נבנה על ידי <b>אדם קריב</b></p>
		</div>
	</section>
</main>
