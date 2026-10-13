import { afterEach, describe, expect, it, vi } from 'vitest';
import { createImageUpgradeQueue, upgradeReviewImage } from './review-image-loading';

const disposers: Array<() => void> = [];

afterEach(async () => {
	for (const dispose of disposers.splice(0)) dispose();
	if (vi.isFakeTimers()) await vi.runAllTimersAsync();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

const browserImage = (
	options: { loaded?: boolean; pageReady?: boolean; observer?: boolean } = {}
) => {
	vi.useFakeTimers();
	const nodeListeners = new Map<string, () => void>();
	const windowListeners = new Map<string, () => void>();
	let src = '/images/photo.png?preview=card-v1';
	let top = 10;
	let intersect!: (entries: Array<{ isIntersecting: boolean }>) => void;
	let finish!: () => void;
	let fail!: (err: Error) => void;
	const requests: Array<{ src: string; priority: string }> = [];
	const disconnect = vi.fn();
	vi.stubGlobal('document', { readyState: options.pageReady === false ? 'loading' : 'complete' });
	vi.stubGlobal('window', {
		innerHeight: 800,
		innerWidth: 1000,
		addEventListener: (type: string, listener: () => void) => windowListeners.set(type, listener),
		removeEventListener: (type: string) => windowListeners.delete(type)
	});
	vi.stubGlobal(
		'IntersectionObserver',
		options.observer === false
			? undefined
			: class {
					constructor(callback: typeof intersect) {
						intersect = callback;
					}
					observe() {}
					disconnect = disconnect;
				}
	);
	vi.stubGlobal(
		'Image',
		class {
			decoding = '';
			fetchPriority = '';
			private source = '';
			get src() {
				return this.source;
			}
			set src(value: string) {
				this.source = value;
				if (!value) fail?.(new Error('cancelled'));
			}
			decode() {
				requests.push({ src: this.src, priority: this.fetchPriority });
				return new Promise<void>((resolve, reject) => {
					finish = resolve;
					fail = reject;
				});
			}
		}
	);
	const node = {
		complete: options.loaded !== false,
		getAttribute: () => src,
		get src() {
			return src;
		},
		set src(value: string) {
			src = value;
		},
		addEventListener: (type: string, listener: () => void) => nodeListeners.set(type, listener),
		removeEventListener: (type: string) => nodeListeners.delete(type),
		getBoundingClientRect: () => ({
			top,
			bottom: top + 300,
			left: 0,
			right: 300,
			width: 300,
			height: 300
		})
	} as unknown as HTMLImageElement;
	return {
		node,
		requests,
		nodeListeners,
		windowListeners,
		disconnect,
		visible: () => intersect([{ isIntersecting: true }]),
		finish: () => finish(),
		fail: () => fail(new Error('decode failed')),
		setTop: (value: number) => {
			top = value;
		}
	};
};

describe('image upgrade queue', () => {
	it('waits for all visible previews before starting originals and runs one at a time', async () => {
		vi.useFakeTimers();
		const queue = createImageUpgradeQueue();
		let finish!: () => void;
		const first = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
		const second = vi.fn().mockResolvedValue(undefined);
		const a = queue.register(first);
		const b = queue.register(second);
		a.update(true, true);
		b.update(true, false);
		await vi.runAllTimersAsync();
		expect(first).not.toHaveBeenCalled();
		b.update(true, true);
		await vi.runAllTimersAsync();
		expect(first).toHaveBeenCalledTimes(1);
		expect(second).not.toHaveBeenCalled();
		finish();
		await vi.runAllTimersAsync();
		expect(second).toHaveBeenCalledTimes(1);
	});

	it('withdraws queued offscreen and disposed photos and resumes on visibility', async () => {
		vi.useFakeTimers();
		const queue = createImageUpgradeQueue();
		const offscreen = vi.fn().mockResolvedValue(undefined);
		const disposed = vi.fn().mockResolvedValue(undefined);
		const a = queue.register(offscreen);
		const b = queue.register(disposed);
		a.update(true, true);
		b.update(true, false);
		a.update(false, true);
		b.dispose();
		await vi.runAllTimersAsync();
		expect(offscreen).not.toHaveBeenCalled();
		expect(disposed).not.toHaveBeenCalled();
		a.update(true, true);
		await vi.runAllTimersAsync();
		expect(offscreen).toHaveBeenCalledTimes(1);
		a.update(false, true);
		a.update(true, true);
		await vi.runAllTimersAsync();
		expect(offscreen).toHaveBeenCalledTimes(1);
	});

	it('continues after original failure without repeatedly retrying it', async () => {
		vi.useFakeTimers();
		const queue = createImageUpgradeQueue();
		const failure = vi.fn().mockRejectedValue(new Error('download failed'));
		const next = vi.fn().mockResolvedValue(undefined);
		queue.register(failure).update(true, true);
		queue.register(next).update(true, true);
		await vi.runAllTimersAsync();
		expect(failure).toHaveBeenCalledTimes(1);
		expect(next).toHaveBeenCalledTimes(1);
	});
});

describe('progressive image lifecycle', () => {
	it('keeps the preview until the low-priority original has decoded', async () => {
		const browser = browserImage();
		disposers.push(upgradeReviewImage(browser.node, '/images/photo.png'));
		browser.visible();
		await vi.runAllTimersAsync();
		expect(browser.requests).toEqual([{ src: '/images/photo.png', priority: 'low' }]);
		expect(browser.node.src).toContain('?preview=');
		browser.finish();
		await vi.runAllTimersAsync();
		expect(browser.node.src).toBe('/images/photo.png');
	});

	it('waits for the page and preview even when the image is visible', async () => {
		const browser = browserImage({ loaded: false, pageReady: false });
		disposers.push(upgradeReviewImage(browser.node, '/images/photo.png'));
		browser.visible();
		browser.windowListeners.get('load')!();
		await vi.runAllTimersAsync();
		expect(browser.requests).toHaveLength(0);
		browser.nodeListeners.get('error')!();
		await vi.runAllTimersAsync();
		expect(browser.requests).toHaveLength(1);
		browser.finish();
		await vi.runAllTimersAsync();
		expect(browser.node.src).toBe('/images/photo.png');
	});

	it('keeps a successful preview after original decode failure', async () => {
		const browser = browserImage();
		disposers.push(upgradeReviewImage(browser.node, '/images/photo.png'));
		browser.visible();
		await vi.runAllTimersAsync();
		browser.fail();
		await vi.runAllTimersAsync();
		expect(browser.node.src).toContain('?preview=');
	});

	it('ignores an old original after its source changes', async () => {
		const browser = browserImage();
		disposers.push(upgradeReviewImage(browser.node, '/images/photo.png'));
		browser.visible();
		await vi.runAllTimersAsync();
		browser.node.src = '/images/new.png?preview=card-v1';
		browser.finish();
		await vi.runAllTimersAsync();
		expect(browser.node.src).toBe('/images/new.png?preview=card-v1');
	});

	it('disposes observers, listeners and an in-flight original without replacing its preview', async () => {
		const browser = browserImage();
		const dispose = upgradeReviewImage(browser.node, '/images/photo.png');
		browser.visible();
		await vi.runAllTimersAsync();
		dispose();
		await vi.runAllTimersAsync();
		expect(browser.disconnect).toHaveBeenCalledTimes(1);
		expect(browser.nodeListeners.size).toBe(0);
		expect(browser.windowListeners.size).toBe(0);
		expect(browser.node.src).toContain('?preview=');
	});

	it('checks actual visibility when intersection observers are unavailable', async () => {
		const browser = browserImage({ observer: false });
		browser.setTop(900);
		disposers.push(upgradeReviewImage(browser.node, '/images/photo.png'));
		await vi.runAllTimersAsync();
		expect(browser.requests).toHaveLength(0);
		browser.setTop(10);
		browser.windowListeners.get('scroll')!();
		await vi.runAllTimersAsync();
		expect(browser.requests).toHaveLength(1);
		browser.finish();
		await vi.runAllTimersAsync();
	});

	it('does not download another copy of an original or local blob', () => {
		const browser = browserImage();
		browser.node.src = 'blob:local-photo';
		disposers.push(upgradeReviewImage(browser.node, 'blob:local-photo'));
		expect(browser.requests).toHaveLength(0);
		expect(browser.nodeListeners.size).toBe(0);
	});
});
