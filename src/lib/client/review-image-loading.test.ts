import { describe, expect, it, vi } from 'vitest';
import { prepareReviewImage } from './review-image-loading';

const browserImage = (width = 768, height = 1024, complete = true) => {
	const attrs = new Map([
		['src', '/images/photo.jpg?preview=photo-768-v2'],
		['srcset', 'responsive candidates'],
		['sizes', '100vw']
	]);
	const listeners = new Map<string, () => void>();
	const sizeWrites = vi.fn();
	const node = {
		complete,
		naturalWidth: width,
		naturalHeight: height,
		getAttribute: (key: string) => attrs.get(key),
		get sizes() {
			return attrs.get('sizes') ?? '';
		},
		set sizes(value: string) {
			sizeWrites(value);
			attrs.set('sizes', value);
		},
		addEventListener: (name: string, listener: () => void) => listeners.set(name, listener),
		removeEventListener: (name: string) => listeners.delete(name)
	} as unknown as HTMLImageElement;
	return { node, attrs, listeners, sizeWrites };
};

describe('responsive photo lifecycle', () => {
	it('reports loaded dimensions without changing Svelte-owned image attributes', () => {
		const image = browserImage(1200, 800);
		const loaded = vi.fn();
		const failed = vi.fn();
		const dispose = prepareReviewImage(image.node, { loaded, failed });
		expect(loaded).toHaveBeenCalledWith({ width: 1200, height: 800 });
		expect(image.attrs.get('sizes')).toBe('100vw');
		expect(image.sizeWrites).not.toHaveBeenCalled();
		image.listeners.get('error')!();
		expect(failed).toHaveBeenCalledOnce();
		expect(image.attrs.get('srcset')).toBe('responsive candidates');
		expect(image.attrs.get('src')).toContain('?preview=');
		dispose();
	});

	it('reports a pre-hydration failure once and ignores subsequent load events', () => {
		const image = browserImage(0, 0);
		const callbacks = { loaded: vi.fn(), failed: vi.fn() };
		const dispose = prepareReviewImage(image.node, callbacks);
		image.listeners.get('error')!();
		image.listeners.get('load')!();
		expect(callbacks.failed).toHaveBeenCalledOnce();
		expect(callbacks.loaded).not.toHaveBeenCalled();
		dispose();
	});
	it('retains the first decoded ratio when density correction changes intrinsic dimensions', () => {
		const image = browserImage(1200, 800);
		const callbacks = { loaded: vi.fn(), failed: vi.fn() };
		const dispose = prepareReviewImage(image.node, callbacks);
		Object.assign(image.node, { naturalWidth: 400, naturalHeight: 267 });
		image.listeners.get('load')!();
		expect(callbacks.loaded).toHaveBeenCalledExactlyOnceWith({ width: 1200, height: 800 });
		dispose();
	});
	it('waits for unfinished images and removes listeners on disposal', () => {
		const image = browserImage(0, 0, false);
		const callbacks = { loaded: vi.fn(), failed: vi.fn() };
		const dispose = prepareReviewImage(image.node, callbacks);
		expect(callbacks.failed).not.toHaveBeenCalled();
		expect(callbacks.loaded).not.toHaveBeenCalled();
		dispose();
		expect(image.listeners.size).toBe(0);
	});
});
