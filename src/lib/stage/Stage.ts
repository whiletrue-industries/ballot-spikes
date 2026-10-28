// The fixed canvas behind the story. Everything on it is a pure function of
// (step, progress, pick); the ticker eases what's on screen toward that target,
// so scrubbing back and forth always lands in a consistent picture.
import { Application, Container, Graphics, Sprite, Text, type Texture, type TextStyleFontWeight } from 'pixi.js';
import type { Election, List } from '$lib/data/election';
import { fmt, inkOf } from '$lib/data/election';
import { BLANK, clamp01, ease, stepIndex, surplusAwarded, type Step } from '$lib/story/timeline';
import { COLORS, SLIP_H, SLIP_W, slipTexture } from './textures';

export interface StageState {
	step: Step;
	p: number;
	pick: string | null;
}

interface Vec {
	x: number;
	y: number;
	sx: number;
	sy: number;
	rot: number;
	alpha: number;
}

interface Slip {
	list: List;
	j: number;
	n: number;
	sprite: Sprite;
	cur: Vec;
	seed: { x: number; y: number; rot: number; phase: number; order: number; jx: number; jr: number; fall: number };
}

interface SpikeView {
	list: List;
	nail: Graphics;
	letters: Text;
	name: Text;
	seats: Text;
	stamp: Container;
	x: number; // eased
}

const INK = 0x1b1b1b;
const STAMP = 0xb3261e;
const ENVELOPE = 0x2f5da8;
const WOOD = 0x8a6a45;

const rand = (() => {
	let s = 20261027;
	return () => {
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
})();

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class Stage {
	app!: Application;
	e: Election;
	state: StageState = { step: 'title', p: 0, pick: null };
	reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	world = new Container();
	screen = new Container();
	nails = new Container();
	slipLayer = new Container();
	fx = new Graphics();
	labels = new Container();
	arc = new Graphics();
	dots = new Graphics();
	dotsWrap = new Container();
	me = new Graphics();

	slips: Slip[] = [];
	spikes: SpikeView[] = [];
	mine: Sprite | null = null;
	mineCur: Vec = { x: 0, y: 0, sx: 0, sy: 0, rot: 0, alpha: 0 };
	mineTex = new Map<string, Texture>();
	faceTex = new Map<string, Texture>();
	edgeTex!: Texture;
	mineEdgeTex!: Texture;
	thrLabel!: Text;
	barLabels = new Map<string, Text>();
	entityLabels = new Map<string, Text>();
	dotsFor = '';

	votesPerSlip: number;
	anim = new Map<string, number>();
	cam = { x: 0, y: 0, z: 1 };
	time = 0;

	// geometry (set in layout)
	W = 0;
	H = 0;
	mobile = false;
	x0 = 0;
	x1 = 0;
	y0 = 0;
	base = 0;
	px = 0;
	gap = 0;
	slipW = 0;

	constructor(e: Election) {
		this.e = e;
		const valid = e.allocation.validVotes;
		this.votesPerSlip = [1000, 2000, 2500, 5000, 10000, 20000].find((k) => valid / k <= 1100) ?? 20000;
	}

	static async create(el: HTMLElement, e: Election) {
		const s = new Stage(e);
		await Promise.all(
			['40px "Secular One"', '600 12px "Assistant"', '800 12px "Assistant"', '700 12px "IBM Plex Mono"'].map((f) =>
				document.fonts.load(f, 'אבג123')
			)
		);
		s.app = new Application();
		await s.app.init({
			resizeTo: window,
			backgroundAlpha: 0,
			antialias: true,
			autoDensity: true,
			resolution: Math.min(window.devicePixelRatio, 2)
		});
		el.appendChild(s.app.canvas);
		// the stage is display-only: no Pixi hit-testing, and touches must scroll the page
		s.app.stage.eventMode = 'none';
		s.app.canvas.style.touchAction = 'auto';
		s.build();
		s.layout();
		s.app.ticker.add((t) => s.tick(t.deltaMS / 1000));
		window.addEventListener('resize', s.onResize);
		return s;
	}

	onResize = () => requestAnimationFrame(() => this.layout());

	destroy() {
		window.removeEventListener('resize', this.onResize);
		this.app.destroy(true, { children: true, texture: true });
	}

	set(state: StageState) {
		this.state = state;
	}

	// ---------- construction ----------

	build() {
		const { e } = this;
		this.app.stage.addChild(this.world, this.screen);
		this.world.addChild(this.nails, this.slipLayer, this.fx, this.labels);
		this.dotsWrap.addChild(this.dots, this.me);
		this.screen.addChild(this.arc, this.dotsWrap);

		const textStyle = (size: number, fill = INK, family = 'Assistant', weight: TextStyleFontWeight = '600') => ({
			fontFamily: family,
			fontSize: size,
			fill,
			fontWeight: weight,
			align: 'center' as const
		});

		this.edgeTex = slipTexture('', '', 'edge');
		this.mineEdgeTex = slipTexture('', '', 'mine-edge');
		for (const list of e.lists) {
			const tex = slipTexture(list.letters, list.name);
			this.faceTex.set(list.id, tex);
			this.mineTex.set(list.id, slipTexture(list.letters, list.name, 'mine'));
			const n = Math.max(1, Math.round(list.votes / this.votesPerSlip));
			for (let j = 0; j < n; j++) {
				const sprite = new Sprite(tex);
				sprite.anchor.set(0.5);
				this.slips.push({
					list,
					j,
					n,
					sprite,
					cur: { x: 0, y: 0, sx: 0, sy: 0, rot: 0, alpha: 0 },
					seed: {
						x: rand(),
						y: rand(),
						rot: (rand() - 0.5) * 1.6,
						phase: rand() * Math.PI * 2,
						order: rand(),
						jx: (rand() - 0.5) * 3,
						jr: (rand() - 0.5) * 0.06,
						fall: rand()
					}
				});
			}

			const nail = new Graphics();
			this.nails.addChild(nail);
			const letters = new Text({ text: list.letters || '•••', style: textStyle(20, INK, 'Secular One', '400') });
			const name = new Text({ text: list.name, style: textStyle(11) });
			const seats = new Text({ text: '', style: textStyle(18, INK, 'IBM Plex Mono', '700') });
			for (const t of [letters, name, seats]) t.anchor.set(0.5, 0);
			seats.anchor.set(0.5, 1);
			const stamp = new Container();
			const st = new Text({ text: 'לא עבר', style: textStyle(18, STAMP, 'Secular One', '400') });
			st.anchor.set(0.5);
			const box = new Graphics()
				.roundRect(-st.width / 2 - 7, -st.height / 2 - 2, st.width + 14, st.height + 4, 4)
				.stroke({ width: 2.5, color: STAMP });
			stamp.addChild(box, st);
			stamp.rotation = -0.22;
			stamp.alpha = 0;
			this.labels.addChild(letters, name, seats, stamp);
			this.spikes.push({ list, nail, letters, name, seats, stamp, x: 0 });
		}
		// slips are shuffled in z so stacks interleave naturally while flying
		const shuffled = this.slips.map((s) => s.sprite).sort((a, b) => a.uid - b.uid);
		for (let i = shuffled.length - 1; i > 0; i--) {
			const j = Math.floor(rand() * (i + 1));
			[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
		}
		this.slipLayer.addChild(...shuffled);

		this.mineTex.set(BLANK, slipTexture('', '', 'blank'));
		this.mine = new Sprite(this.mineTex.get(BLANK)!);
		this.mine.anchor.set(0.5);
		this.mine.alpha = 0;
		this.world.addChild(this.mine);

		this.thrLabel = new Text({ text: '', style: { ...textStyle(13, STAMP, 'Assistant', '800') } });
		this.thrLabel.anchor.set(0, 1);
		this.labels.addChild(this.thrLabel);

		for (const ent of e.allocation.entities) {
			const t = new Text({ text: '', style: textStyle(11, ENVELOPE, 'IBM Plex Mono', '700') });
			t.anchor.set(0.5, 1);
			this.labels.addChild(t);
			this.barLabels.set(ent.id, t);
			const el = new Text({ text: '', style: textStyle(16, INK, 'IBM Plex Mono', '700') });
			el.anchor.set(0.5, 1);
			this.labels.addChild(el);
			this.entityLabels.set(ent.id, el);
		}
	}

	layout() {
		const w = window.innerWidth;
		const h = window.innerHeight;
		// on phones the address bar shows/hides while scrolling; don't let that jolt the spikes
		if (w === this.W && w < 820 && Math.abs(h - this.H) < 160) return;
		this.W = w;
		this.H = h;
		this.mobile = this.W < 820;
		if (this.mobile) {
			this.x0 = 6;
			this.x1 = this.W - 6;
			this.y0 = 64;
			this.base = this.H - 64;
		} else {
			this.x0 = 32;
			this.x1 = this.W * 0.6;
			this.y0 = 90;
			this.base = this.H - 90;
		}
		const maxVotes = Math.max(...this.e.lists.map((l) => l.votes));
		this.px = ((this.base - this.y0) * 0.8) / maxVotes;
		this.gap = (this.x1 - this.x0) / this.e.lists.length;
		this.slipW = Math.min(this.gap * 0.82, 84);
		for (const s of this.spikes) {
			s.name.visible = this.gap > 44;
			s.name.style.wordWrap = true;
			s.name.style.wordWrapWidth = this.gap * 0.95;
			s.name.style.lineHeight = 12;
			s.letters.style.fontSize = Math.min(20, this.gap * 0.42);
		}
		this.dotsFor = '';
	}

	// ---------- geometry helpers ----------

	get si() {
		return stepIndex(this.state.step);
	}
	at(s: Step) {
		return this.si >= stepIndex(s);
	}
	is(s: Step) {
		return this.state.step === s;
	}
	/** progress through step s: 0 before it, 1 after it. */
	prog(s: Step) {
		const i = stepIndex(s);
		return this.si < i ? 0 : this.si > i ? 1 : this.state.p;
	}

	passed(id: string) {
		return this.e.allocation.passed.includes(id);
	}

	/** Spike order: by votes; from the agreements step on, surplus pairs sit side by side. */
	order(): string[] {
		const ids = this.e.lists.map((l) => l.id);
		if (!this.at('agreements') || this.at('knesset')) return ids;
		const out: string[] = [];
		for (const ent of this.e.allocation.entities) out.push(...ent.members);
		return [...out, ...ids.filter((id) => !out.includes(id))];
	}

	spikeX(id: string) {
		const i = this.order().indexOf(id);
		return this.x1 - (i + 0.5) * this.gap;
	}

	stackH(list: List) {
		return list.votes * this.px;
	}

	/** Eased property toward a target; used for scalar overlays. */
	a(key: string, target: number, dt: number, k = 7) {
		const cur = this.anim.get(key) ?? target;
		const next = this.reduced ? target : lerp(cur, target, 1 - Math.exp(-k * dt));
		this.anim.set(key, next);
		return next;
	}

	// ---------- frame ----------

	tick(dt: number) {
		dt = Math.min(dt, 0.05);
		this.time += dt;
		const k = this.reduced ? 1 : 1 - Math.exp(-9 * dt);
		const { e } = this;
		const alloc = e.allocation;

		// spikes slide to their (possibly regrouped) x
		const xs = new Map<string, number>();
		for (const s of this.spikes) {
			const tx = this.spikeX(s.list.id);
			s.x = s.x === 0 ? tx : lerp(s.x, tx, k);
			xs.set(s.list.id, s.x);
		}

		const rise = ease(clamp01(this.prog('spikes') / 0.15));
		const thrP = this.prog('threshold');
		const fallen = (id: string) => !this.passed(id) && thrP > 0.45;
		const crowd = this.is('finale') && this.state.p > 0.3 && this.finaleTarget() ? 0.12 : 1;
		const dimStacks =
			(this.is('bader') || this.is('split') ? 0.22 : this.at('knesset') && !this.at('finale') ? 0.06 : 1) * crowd;
		const quotaP = this.prog('quota');

		// --- slips ---
		const flyP = this.prog('spikes');
		const sw = this.slipW / SLIP_W;
		const pick = this.state.pick;
		for (const s of this.slips) {
			const { list, j, n, seed } = s;
			const x = xs.get(list.id)!;
			const h = this.stackH(list);
			const thick = Math.max(2.4, (h / n) * 1.5);
			const stack: Vec = {
				x: x + seed.jx,
				y: this.base - (j + 0.5) * (h / n) - 4,
				sx: sw,
				sy: thick / SLIP_H,
				rot: seed.jr,
				alpha: 1
			};
			const scatterScale = this.mobile ? 1.1 : 1.7;
			const scatter: Vec = {
				x: seed.x * this.W + Math.sin(this.time * 0.25 + seed.phase) * 18,
				y: seed.y * this.H + Math.cos(this.time * 0.2 + seed.phase) * 14,
				sx: scatterScale,
				sy: scatterScale,
				rot: seed.rot + Math.sin(this.time * 0.15 + seed.phase) * 0.1,
				alpha: 0.9
			};
			let t: Vec;
			if (this.is('title')) t = scatter;
			else if (this.is('spikes')) {
				const start = 0.12 + seed.order * 0.55;
				const f = ease(clamp01((flyP - start) / 0.28));
				t = {
					x: lerp(scatter.x, stack.x, f),
					y: lerp(scatter.y, stack.y, f) - Math.sin(Math.PI * f) * 90,
					sx: lerp(scatter.sx, stack.sx, f),
					sy: lerp(scatter.sy, stack.sy, f * f),
					rot: lerp(scatter.rot, stack.rot, f),
					alpha: lerp(scatter.alpha, 1, f)
				};
			} else t = stack;

			if (fallen(list.id)) {
				const f = ease(clamp01((thrP - 0.45 - seed.fall * 0.2) / 0.3));
				t = { ...t, y: t.y + f * (this.H - t.y + 80), rot: t.rot + f * (seed.rot * 3), alpha: 1 - f };
				// in the finale, a failed pick gets its ghost stack back
				if (this.is('finale') && pick === list.id) t = { ...stack, alpha: 0.35 };
			}
			if (this.at('history') && !this.at('threshold')) t.alpha *= this.is('history') ? 0.55 : 1;
			t.alpha *= dimStacks;
			if (this.is('finale') && pick && pick !== BLANK && list.id !== pick) t.alpha *= 0.35;

			const c = s.cur;
			if (c.alpha === 0 && c.sx === 0) Object.assign(c, t);
			c.x = lerp(c.x, t.x, k);
			c.y = lerp(c.y, t.y, k);
			c.sx = lerp(c.sx, t.sx, k);
			c.sy = lerp(c.sy, t.sy, k);
			c.rot = lerp(c.rot, t.rot, k);
			c.alpha = lerp(c.alpha, t.alpha, k);
			const sp = s.sprite;
			sp.position.set(c.x, c.y);
			sp.scale.set(c.sx, c.sy);
			sp.rotation = c.rot;
			sp.alpha = c.alpha;
			sp.visible = c.alpha > 0.01;
			sp.texture = c.sy < 0.2 ? this.edgeTex : this.faceTex.get(list.id)!;

			// leftover votes (above the last full seat) get a stamp-red tint
			const floor = alloc.floorSeats[list.id] ?? 0;
			const slipTopVotes = ((j + 1) / n) * list.votes;
			const leftover = this.passed(list.id) && slipTopVotes > floor * alloc.quota + this.votesPerSlip * 0.5;
			sp.tint = quotaP > 0.6 && leftover && !this.at('knesset') ? 0xf3c9c2 : 0xffffff;
		}

		// --- my slip ---
		this.tickMine(k, xs, sw);

		// --- spikes, labels, overlays ---
		const g = this.fx.clear();
		const nailTop = this.y0 - 10;
		const seatsShown = this.seatsShown();
		for (const s of this.spikes) {
			const { list } = s;
			const x = s.x;
			const failed = !this.passed(list.id);
			const dim = failed && thrP > 0.55 ? 0.35 : 1;
			const alpha = rise * dim * (this.at('knesset') && !this.at('finale') ? 0.1 : 1) * (crowd < 1 ? 0.4 : 1);
			const lift = (1 - rise) * 60;
			s.nail
				.clear()
				.moveTo(x, this.base + lift)
				.lineTo(x, nailTop + (this.base - nailTop) * (1 - rise) + 6)
				.stroke({ width: 2, color: 0x6d6d6d, alpha })
				.moveTo(x - 1, nailTop + 6 + lift)
				.lineTo(x, nailTop + lift)
				.lineTo(x + 1, nailTop + 6 + lift)
				.stroke({ width: 1, color: 0x6d6d6d, alpha })
				.roundRect(x - this.slipW * 0.55, this.base - 4 + lift, this.slipW * 1.1, 9, 3)
				.fill({ color: WOOD, alpha });
			s.letters.position.set(x, this.base + 10 + lift);
			s.letters.alpha = alpha;
			s.name.position.set(x, this.base + 34 + lift);
			s.name.alpha = alpha;

			const shown = seatsShown.get(list.id);
			s.seats.text = shown === undefined ? '' : String(shown);
			s.seats.position.set(x, this.base - this.stackH(list) - 10);
			s.seats.alpha = this.a(`seats:${list.id}`, shown === undefined || dimStacks < 0.5 ? 0 : 1, dt);
			s.seats.style.fontSize = Math.min(18, this.gap * 0.4);

			const stampOn = failed && thrP > 0.55 && (!this.at('knesset') || (this.is('finale') && pick === list.id));
			s.stamp.alpha = this.a(`stamp:${list.id}`, stampOn ? 1 : 0, dt, 12);
			const sc = this.a(`stampScale:${list.id}`, stampOn ? 1 : 2.2, dt, 12);
			s.stamp.scale.set(sc * Math.min(1, this.gap / 70));
			s.stamp.position.set(x, this.base - Math.max(this.stackH(list), 30) - 6);
		}

		this.drawThreshold(g, dt, thrP);
		this.drawQuota(g, dt, xs, quotaP);
		this.drawAgreements(g, dt, xs);
		this.drawBars(g, dt, xs);
		this.drawArc(dt);
		this.drawFinale(dt, xs);
		this.camera(dt, xs);
	}

	tickMine(k: number, xs: Map<string, number>, sw: number) {
		const mine = this.mine!;
		const pick = this.state.pick;
		if (!pick) {
			this.mineCur.alpha = lerp(this.mineCur.alpha, 0, k);
			mine.alpha = this.mineCur.alpha;
			return;
		}
		const face = this.mineTex.get(pick)!;
		const tex = this.mineCur.sy < 0.2 && pick !== BLANK ? this.mineEdgeTex : face;
		if (mine.texture !== tex) mine.texture = tex;
		const list = this.e.lists.find((l) => l.id === pick);
		const cx = (this.x0 + this.x1) / 2;
		const cy = (this.y0 + this.base) / 2;
		const center: Vec = {
			x: cx,
			y: cy + Math.sin(this.time * 1.4) * 6,
			sx: this.mobile ? 1.6 : 2.4,
			sy: this.mobile ? 1.6 : 2.4,
			rot: Math.sin(this.time * 0.8) * 0.04,
			alpha: 1
		};
		let onStack: Vec;
		if (list) {
			const x = xs.get(list.id)!;
			onStack = { x, y: this.base - this.stackH(list) - 6, sx: sw * 1.05, sy: 6 / SLIP_H, rot: 0, alpha: 1 };
		} else {
			// blank ballots go to the invalid pile at the far end
			onStack = { x: this.x0 + 40, y: this.base - 40, sx: 0.7, sy: 0.7, rot: -0.2, alpha: 0.9 };
		}
		let t: Vec;
		if (!this.at('pick')) t = { ...center, alpha: 0 };
		else if (this.is('pick')) t = center;
		else if (this.is('yours')) {
			const f = ease(clamp01((this.state.p - 0.15) / 0.5));
			t = {
				x: lerp(center.x, onStack.x, f),
				y: lerp(center.y, onStack.y, f) - Math.sin(Math.PI * f) * 60,
				sx: lerp(center.sx, onStack.sx, f),
				sy: lerp(center.sy, onStack.sy, f * f),
				rot: lerp(center.rot, onStack.rot, f),
				alpha: 1
			};
		} else t = onStack;
		if (list && !this.passed(list.id) && this.prog('threshold') > 0.45 && !this.is('finale')) {
			const f = ease(clamp01((this.prog('threshold') - 0.5) / 0.3));
			t = { ...t, y: t.y + f * (this.H - t.y + 80), rot: f * 1.2, alpha: 1 - f };
		}
		if (this.at('knesset') && !this.at('finale')) t.alpha *= 0.1;
		const c = this.mineCur;
		if (c.sx === 0) Object.assign(c, t);
		c.x = lerp(c.x, t.x, k);
		c.y = lerp(c.y, t.y, k);
		c.sx = lerp(c.sx, t.sx, k);
		c.sy = lerp(c.sy, t.sy, k);
		c.rot = lerp(c.rot, t.rot, k);
		c.alpha = lerp(c.alpha, t.alpha, k);
		mine.position.set(c.x, c.y);
		mine.scale.set(c.sx, c.sy);
		mine.rotation = c.rot;
		mine.alpha = c.alpha;
	}

	/** Seat number shown above each spike for the current moment in the story. */
	seatsShown(): Map<string, number> {
		const alloc = this.e.allocation;
		const out = new Map<string, number>();
		if (!this.at('quota') || (this.is('quota') && this.state.p < 0.35)) return out;
		if (this.at('split') && (!this.is('split') || this.state.p > 0.35)) {
			for (const id of alloc.passed) out.set(id, alloc.seats[id]);
			return out;
		}
		const awarded = this.at('bader') ? surplusAwarded(this.prog('bader'), alloc.surplusSteps.length) : 0;
		const extra = new Map<string, number>();
		for (const st of alloc.surplusSteps.slice(0, awarded)) extra.set(st.winner, (extra.get(st.winner) ?? 0) + 1);
		for (const ent of alloc.entities) {
			if (ent.members.length === 1) out.set(ent.id, alloc.floorSeats[ent.id] + (extra.get(ent.id) ?? 0));
			else for (const m of ent.members) out.set(m, alloc.floorSeats[m]);
		}
		return out;
	}

	drawThreshold(g: Graphics, dt: number, thrP: number) {
		const alloc = this.e.allocation;
		const sweep = this.a('thrSweep', this.is('threshold') ? ease(clamp01(thrP / 0.4)) : this.at('threshold') ? 1 : 0, dt);
		const vis = this.a('thrVis', this.at('threshold') && !this.at('agreements') ? 1 : 0, dt);
		const y = this.base - alloc.thresholdVotes * this.px - 4;
		const xa = this.x1 + 10;
		const xb = lerp(xa, this.x0 - 6, sweep);
		if (vis > 0.01) {
			for (let x = xa; x > xb; x -= 10) g.moveTo(x, y).lineTo(Math.max(xb, x - 6), y);
			g.stroke({ width: 2, color: STAMP, alpha: vis });
		}
		this.thrLabel.text = `אחוז החסימה · ${fmt(alloc.thresholdVotes)} קולות`;
		this.thrLabel.position.set(Math.max(xb, this.x0), y - 6);
		this.thrLabel.alpha = vis * sweep;
	}

	drawQuota(g: Graphics, dt: number, xs: Map<string, number>, quotaP: number) {
		const alloc = this.e.allocation;
		const vis = this.a('quotaVis', this.at('quota') && !this.at('bader') ? 1 : 0, dt);
		if (vis < 0.01) return;
		const maxFloor = Math.max(...Object.values(alloc.floorSeats));
		const reveal = (this.is('quota') ? clamp01(quotaP / 0.55) : 1) * maxFloor;
		const qh = alloc.quota * this.px;
		for (const id of alloc.passed) {
			const x = xs.get(id)!;
			const w = this.slipW * 0.62;
			const fs = alloc.floorSeats[id];
			for (let s = 1; s <= Math.min(fs, Math.floor(reveal)); s++) {
				const y = this.base - s * qh - 4;
				g.moveTo(x - w, y).lineTo(x + w, y);
			}
		}
		g.stroke({ width: 1, color: INK, alpha: 0.55 * vis });
	}

	drawAgreements(g: Graphics, dt: number, xs: Map<string, number>) {
		const alloc = this.e.allocation;
		const vis = this.a('agrVis', this.at('agreements') && !this.at('knesset') ? 1 : 0, dt);
		const p = this.is('agreements') ? ease(clamp01((this.state.p - 0.2) / 0.5)) : 1;
		for (const ent of alloc.entities) {
			if (ent.members.length < 2 || vis < 0.01) continue;
			const [a, b] = ent.members.map((m) => xs.get(m)!);
			const y = this.base + (this.mobile ? 26 : 50);
			const xb = lerp(a, b, p);
			g.moveTo(a, this.base + 6)
				.quadraticCurveTo(a, y, (a + xb) / 2, y)
				.quadraticCurveTo(xb, y, xb, this.base + 6 + (1 - p) * 30)
				.stroke({ width: 2.5, color: STAMP, alpha: vis });
		}
	}

	drawBars(g: Graphics, dt: number, xs: Map<string, number>) {
		const alloc = this.e.allocation;
		const vis = this.a('barVis', this.is('bader') ? 1 : 0, dt);
		const N = alloc.surplusSteps.length;
		const awarded = surplusAwarded(this.prog('bader'), N);
		const next = alloc.surplusSteps[Math.min(awarded, N - 1)];
		const maxRatio = Math.max(...alloc.surplusSteps.flatMap((s) => s.candidates.map((c) => c.ratio)));
		const scale = ((this.base - this.y0) * 0.6) / maxRatio;
		for (const ent of alloc.entities) {
			const label = this.barLabels.get(ent.id)!;
			const cand = next?.candidates.find((c) => c.entity === ent.id);
			const seatsNow =
				ent.members.reduce((s, m) => s + alloc.floorSeats[m], 0) +
				alloc.surplusSteps.slice(0, awarded).filter((s) => s.winner === ent.id).length;
			const ratio = ent.votes / (seatsNow + 1);
			const h = this.a(`bar:${ent.id}`, vis > 0.01 ? ratio * scale : 0, dt, 10);
			const xsM = ent.members.map((m) => xs.get(m)!);
			const cx = xsM.reduce((a, b) => a + b, 0) / xsM.length;
			const w = this.slipW * 0.7 + (Math.max(...xsM) - Math.min(...xsM));
			const isNext = awarded < N && next?.winner === ent.id;
			if (vis > 0.01) {
				g.rect(cx - w / 2, this.base - 4 - h, w, h).fill({ color: isNext ? STAMP : ENVELOPE, alpha: 0.85 * vis });
			}
			label.text = cand || vis > 0.01 ? fmt(ratio) : '';
			label.style.fontSize = Math.min(11, this.gap * 0.22);
			label.position.set(cx, this.base - 8 - h);
			label.alpha = vis;
			const seatLabel = this.entityLabels.get(ent.id)!;
			seatLabel.text = String(seatsNow);
			seatLabel.style.fill = isNext ? STAMP : INK;
			seatLabel.style.fontSize = Math.min(16, this.gap * 0.36);
			seatLabel.position.set(cx, this.base - 8 - h - Math.min(14, this.gap * 0.26));
			seatLabel.alpha = vis;
		}
	}

	drawArc(dt: number) {
		const g = this.arc.clear();
		const vis = this.a('arcVis', this.is('knesset') ? 1 : 0, dt);
		if (vis < 0.01) return;
		const alloc = this.e.allocation;
		const fill = this.is('knesset') ? clamp01(this.state.p / 0.6) : 1;
		const cx = (this.x0 + this.x1) / 2;
		const cy = this.base;
		const R = Math.min((this.x1 - this.x0) / 2, this.base - this.y0) * 0.95;
		const rows = 6;
		const r0 = R * 0.42;
		const radii = Array.from({ length: rows }, (_, i) => lerp(r0, R, i / (rows - 1)));
		const total = radii.reduce((a, b) => a + b, 0);
		const pts: { x: number; y: number; ang: number }[] = [];
		let left = 120;
		radii.forEach((r, i) => {
			const n = i === rows - 1 ? left : Math.round((120 * r) / total);
			left -= n;
			for (let k = 0; k < n; k++) {
				const ang = n === 1 ? Math.PI / 2 : (k / (n - 1)) * Math.PI;
				pts.push({ x: cx + Math.cos(ang) * r, y: cy - Math.sin(ang) * r, ang });
			}
		});
		pts.sort((a, b) => a.ang - b.ang);
		const dotR = Math.max(2.5, (R - r0) / rows / 2.6);
		const ids = this.e.lists.map((l) => l.id).filter((id) => alloc.seats[id] > 0);
		let i = 0;
		for (const id of ids) {
			for (let s = 0; s < alloc.seats[id]; s++, i++) {
				const pt = pts[i];
				const on = i / 120 < fill;
				g.circle(pt.x, pt.y, dotR).fill({ color: on ? inkOf(id) : 0xcfc6b3, alpha: vis });
				if (id === this.state.pick && on) g.circle(pt.x, pt.y, dotR + 2).stroke({ width: 1.5, color: INK, alpha: vis });
			}
		}
	}

	finaleTarget(): { n: number; ghost: boolean } | null {
		const pick = this.state.pick;
		if (!pick || pick === BLANK) return null;
		const s = this.e.sensitivity[pick];
		if (!s) return null;
		if (!s.passed) return s.missingToPass ? { n: s.missingToPass, ghost: true } : null;
		return s.removeToChange ? { n: s.removeToChange, ghost: false } : null;
	}

	drawFinale(dt: number, xs: Map<string, number>) {
		const tgt = this.finaleTarget();
		const vis = this.a('dotsVis', this.is('finale') && tgt && this.state.p > 0.3 ? 1 : 0, dt, 5);
		this.dotsWrap.alpha = vis;
		if (!tgt) return;
		const key = `${this.state.pick}:${this.W}x${this.H}`;
		const fx0 = this.x0 + 10,
			fx1 = this.x1 - 10,
			fy0 = this.y0 + 10,
			fy1 = this.base - 10;
		const fw = fx1 - fx0,
			fh = fy1 - fy0;
		const n = tgt.n;
		const cell = Math.min(16, Math.max(1.2, Math.sqrt((fw * fh) / n) * 0.92));
		const cols = Math.max(1, Math.floor(fw / cell));
		const rows = Math.ceil(n / cols);
		const gw = cols * cell,
			gh = rows * cell;
		if (this.dotsFor !== key) {
			this.dotsFor = key;
			const g = this.dots.clear();
			const r = Math.max(0.5, cell * 0.36);
			for (let i = 0; i < n; i++) {
				const x = (cols - 1 - (i % cols)) * cell + cell / 2;
				const y = Math.floor(i / cols) * cell + cell / 2;
				if (r < 1.2) g.rect(x - r, y - r, r * 2, r * 2);
				else g.circle(x, y, r);
			}
			if (tgt.ghost) g.stroke({ width: Math.max(0.5, r * 0.4), color: INK, alpha: 0.5 });
			else g.fill({ color: INK, alpha: 0.75 });
			this.dots.pivot.set(gw / 2, gh / 2);
			this.me.pivot.copyFrom(this.dots.pivot);
		}
		// "you" — the last dot, in envelope blue (for a failed list you sit outside the missing crowd)
		const mr = Math.max(4, cell * 0.6);
		const pulse = 1 + Math.sin(this.time * 3) * 0.25;
		const mx = tgt.ghost ? -mr * 3 : (cols - 1 - ((n - 1) % cols)) * cell + cell / 2;
		const my = tgt.ghost ? gh / 2 : Math.floor((n - 1) / cols) * cell + cell / 2;
		this.me
			.clear()
			.circle(mx, my, mr)
			.fill({ color: ENVELOPE })
			.circle(mx, my, mr * 1.8 * pulse)
			.stroke({ width: 2, color: ENVELOPE, alpha: 0.5 });

		// the crowd bursts out of the top of the chosen stack
		const list = this.e.lists.find((l) => l.id === this.state.pick)!;
		const sx = xs.get(list.id)!;
		const sy = this.base - this.stackH(list);
		const grow = this.a('dotsGrow', this.is('finale') ? ease(clamp01((this.state.p - 0.3) / 0.35)) : 0, dt, 6);
		const fit = Math.min(1, fw / gw, fh / gh);
		const screenStack = this.toScreen(sx, sy);
		this.dotsWrap.position.set(
			lerp(screenStack.x, fx0 + fw / 2, grow),
			lerp(screenStack.y, fy0 + fh / 2, grow)
		);
		this.dotsWrap.scale.set(Math.max(0.001, grow * fit));
	}

	toScreen(x: number, y: number) {
		const { cam } = this;
		return { x: (x - cam.x) * cam.z + this.W / 2, y: (y - cam.y) * cam.z + this.H / 2 };
	}

	camera(dt: number, xs: Map<string, number>) {
		let tx = this.W / 2,
			ty = this.H / 2,
			tz = 1;
		const pick = this.state.pick;
		if (this.is('finale') && pick && pick !== BLANK && this.state.p < 0.45) {
			const list = this.e.lists.find((l) => l.id === pick)!;
			tz = this.mobile ? 2.2 : 2.6;
			tx = xs.get(pick)!;
			ty = this.base - this.stackH(list) + 40;
		}
		this.cam.x = this.a('camx', tx, dt, 4);
		this.cam.y = this.a('camy', ty, dt, 4);
		this.cam.z = this.a('camz', tz, dt, 4);
		this.world.pivot.set(this.cam.x, this.cam.y);
		this.world.position.set(this.W / 2, this.H / 2);
		this.world.scale.set(this.cam.z);
	}
}

export { COLORS };
