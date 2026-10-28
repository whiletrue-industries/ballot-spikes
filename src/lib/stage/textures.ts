// Ballot slips drawn with Canvas 2D (best Hebrew shaping), uploaded as Pixi textures.
import { CanvasSource, Texture } from 'pixi.js';

export const SLIP_W = 120;
export const SLIP_H = 80;
const RES = 3;

export const COLORS = {
	paper: '#fbfaf6',
	ink: '#1b1b1b',
	envelope: '#2f5da8',
	stamp: '#b3261e',
	cardboard: '#e9e3d5'
};

export type SlipKind = 'plain' | 'mine' | 'blank' | 'edge' | 'mine-edge';

export function slipTexture(letters: string, name: string, kind: SlipKind = 'plain'): Texture {
	const c = document.createElement('canvas');
	c.width = SLIP_W * RES;
	c.height = SLIP_H * RES;
	const g = c.getContext('2d')!;
	g.scale(RES, RES);
	g.direction = 'rtl';

	const mine = kind === 'mine' || kind === 'mine-edge';
	const bg = mine ? COLORS.envelope : COLORS.paper;
	const fg = mine ? '#ffffff' : COLORS.ink;
	g.fillStyle = bg;
	g.fillRect(0, 0, SLIP_W, SLIP_H);
	// faint paper fibres
	g.globalAlpha = 0.06;
	for (let i = 0; i < 18; i++) {
		g.fillStyle = i % 2 ? '#000' : '#7a6a50';
		g.fillRect(Math.random() * SLIP_W, Math.random() * SLIP_H, Math.random() * 30, 0.6);
	}
	g.globalAlpha = 1;
	if (kind === 'edge' || kind === 'mine-edge') {
		// a slip seen edge-on in a stack: just paper with a darker rim
		g.fillStyle = mine ? '#1d3f7a' : '#b9b1a0';
		g.fillRect(0, SLIP_H - 14, SLIP_W, 14);
		return toTexture(c);
	}
	g.strokeStyle = fg;
	g.lineWidth = 1.4;
	g.strokeRect(4.5, 4.5, SLIP_W - 9, SLIP_H - 9);

	if (kind === 'plain' || kind === 'mine') {
		g.fillStyle = fg;
		g.textAlign = 'center';
		g.textBaseline = 'middle';
		const size = letters.length >= 4 ? 30 : letters.length === 3 ? 36 : 42;
		g.font = `${size}px "Secular One"`;
		g.fillText(letters || '•••', SLIP_W / 2, 34);
		g.font = '600 12px "Assistant"';
		let label = name;
		for (let n = name.length; g.measureText(label).width > SLIP_W - 18 && n > 3; n--) label = name.slice(0, n) + '…';
		g.fillText(label, SLIP_W / 2, 63);
	}
	return toTexture(c);
}

const toTexture = (c: HTMLCanvasElement) => new Texture({ source: new CanvasSource({ resource: c, resolution: RES }) });
