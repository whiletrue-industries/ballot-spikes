// Shared vocabulary between the scrolling text (page) and the canvas (stage).
export const STEPS = [
	'title',
	'spikes',
	'history',
	'pick',
	'yours',
	'threshold',
	'quota',
	'agreements',
	'bader',
	'split',
	'knesset',
	'finale',
	'end'
] as const;
export type Step = (typeof STEPS)[number];

export const stepIndex = (s: Step) => STEPS.indexOf(s);

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** How many surplus seats have been handed out at progress p of the Bader-Ofer step. */
export const surplusAwarded = (p: number, n: number) => Math.max(0, Math.min(n, Math.ceil(((p - 0.1) / 0.8) * n)));

export const BLANK = 'blank';
