import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareReviewImage } from './review-image-loading';

afterEach(() => vi.unstubAllGlobals());

const browserImage = (width = 768, height = 1024, complete = true) => {
	const attrs = new Map([
		['src', '/images/photo.jpg?preview=photo-768-v2'],
		['srcset', 'responsive candidates'],
		['sizes', '100vw']
	]);
	const listeners = new Map<string, () => void>();
	let resize!: () => void;
	let displayed = 380;
	const disconnect = vi.fn();
	const sizeWrites = vi.fn();
	vi.stubGlobal(
		'ResizeObserver',
		class {
			constructor(callback: () => void) {
				resize = callback;
			}
			observe() {}
			disconnect = disconnect;
		}
	);
	const node = {
		complete,
		naturalWidth: width,
		naturalHeight: height,
		get src() {
			return attrs.get('src') ?? '';
		},
		set src(value: string) {
			attrs.set('src', value);
		},
		get sizes() {
			return attrs.get('sizes') ?? '';
		},
		set sizes(value: string) {
			sizeWrites(value);
			attrs.set('sizes', value);
		},
		getAttribute: (key: string) => attrs.get(key),
		hasAttribute: (key: string) => attrs.has(key),
		removeAttribute: (key: string) => attrs.delete(key),
		addEventListener: (name: string, listener: () => void) => listeners.set(name, listener),
		removeEventListener: (name: string) => listeners.delete(name),
		getBoundingClientRect: () => ({ width: displayed, height: displayed })
	} as unknown as HTMLImageElement;
	return {
		node,
		attrs,
		listeners,
		disconnect,
		sizeWrites,
		resize: () => resize(),
		setWidth: (value: number) => {
			displayed = value;
		}
	};
};

describe('responsive photo lifecycle', () => {
	it('does not restart image loading by rewriting an unchanged sizes attribute', () => {
		const image = browserImage();
		const dispose = prepareReviewImage(image.node, '/images/photo.jpg');
		image.listeners.get('load')!();
		expect(image.sizeWrites).toHaveBeenCalledOnce();
		dispose();
	});
	it('keeps the selected derivative without starting an original download', () => {
		const image = browserImage();
		const dispose = prepareReviewImage(image.node, '/images/photo.jpg');
		expect(image.node.src).toContain('?preview=');
		expect(image.node.sizes).toBe('380px');
		dispose();
	});
	it('accounts for landscape cover magnification and changes in display size', () => {
		const image = browserImage(1200, 800);
		const dispose = prepareReviewImage(image.node, '/images/photo.jpg');
		expect(image.node.sizes).toBe('570px');
		image.setWidth(500);
		image.resize();
		expect(image.node.sizes).toBe('750px');
		dispose();
	});
	it('uses the original once on derivative failure and removes responsive candidates', () => {
		const image = browserImage();
		const dispose = prepareReviewImage(image.node, '/images/photo.jpg');
		image.listeners.get('error')!();
		expect(image.node.src).toBe('/images/photo.jpg');
		expect(image.attrs.has('srcset')).toBe(false);
		expect(image.attrs.has('sizes')).toBe(false);
		image.listeners.get('error')!();
		image.listeners.get('load')!();
		expect(image.attrs.has('sizes')).toBe(false);
		dispose();
	});
	it('recovers a failed derivative that completed before hydration', () => {
		const image = browserImage(0, 0);
		const dispose = prepareReviewImage(image.node, '/images/photo.jpg');
		expect(image.node.src).toBe('/images/photo.jpg');
		dispose();
	});
	it('waits for an unfinished derivative and cleans up observers and listeners', () => {
		const image = browserImage(0, 0, false);
		const dispose = prepareReviewImage(image.node, '/images/photo.jpg');
		expect(image.node.src).toContain('?preview=');
		dispose();
		expect(image.listeners.size).toBe(0);
		expect(image.disconnect).toHaveBeenCalledOnce();
	});
	it('leaves a local upload or fallback alone', () => {
		const image = browserImage();
		image.node.src = 'blob:local-photo';
		prepareReviewImage(image.node, 'blob:local-photo')();
		expect(image.listeners.size).toBe(0);
	});
});
