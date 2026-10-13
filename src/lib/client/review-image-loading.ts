interface ImageUpgrade {
	visible: boolean;
	ready: boolean;
	started: boolean;
	start(): Promise<void>;
}

/** Visible previews finish first; full-size downloads then run one at a time. */
export const createImageUpgradeQueue = () => {
	const jobs = new Set<ImageUpgrade>();
	let running = false;
	let scheduled = false;

	const schedule = () => {
		if (scheduled) return;
		scheduled = true;
		setTimeout(() => {
			scheduled = false;
			if (running || [...jobs].some((job) => job.visible && !job.ready)) return;
			const next = [...jobs].find((job) => job.visible && job.ready && !job.started);
			if (!next) return;
			next.started = true;
			running = true;
			void Promise.resolve()
				.then(() => next.start())
				.catch(() => undefined)
				.finally(() => {
					running = false;
					schedule();
				});
		}, 0);
	};

	return {
		register(start: () => Promise<void>) {
			const job: ImageUpgrade = { visible: false, ready: false, started: false, start };
			jobs.add(job);
			return {
				update(visible: boolean, ready: boolean) {
					job.visible = visible;
					job.ready = ready;
					schedule();
				},
				dispose() {
					jobs.delete(job);
					schedule();
				}
			};
		}
	};
};

const upgradeQueue = createImageUpgradeQueue();

/** Attach to a server-rendered preview and dispose when its source or component changes. */
export const upgradeReviewImage = (node: HTMLImageElement, original: string): (() => void) => {
	if (node.getAttribute('src') === original) return () => undefined;
	const initial = node.getAttribute('src');
	let disposed = false;
	let visible = false;
	let previewReady = node.complete;
	let pageReady = document.readyState === 'complete';
	let preload: HTMLImageElement | null = null;

	const job = upgradeQueue.register(async () => {
		if (disposed) return;
		preload = new Image();
		preload.decoding = 'async';
		preload.fetchPriority = 'low';
		preload.src = original;
		try {
			await preload.decode();
			if (!disposed && node.getAttribute('src') === initial) node.src = original;
		} catch {
			// A successfully loaded preview stays visible when its original cannot be decoded.
		} finally {
			preload = null;
		}
	});
	const update = () => job.update(visible, previewReady && pageReady);
	const handlePreviewReady = () => {
		previewReady = true;
		update();
	};
	const handlePageReady = () => {
		pageReady = true;
		update();
	};
	const checkVisibility = () => {
		const box = node.getBoundingClientRect();
		visible =
			box.width > 0 &&
			box.height > 0 &&
			box.bottom > 0 &&
			box.top < window.innerHeight &&
			box.right > 0 &&
			box.left < window.innerWidth;
		update();
	};
	node.addEventListener('load', handlePreviewReady);
	node.addEventListener('error', handlePreviewReady);
	if (!pageReady) window.addEventListener('load', handlePageReady, { once: true });
	let observer: IntersectionObserver | null = null;
	if (typeof IntersectionObserver !== 'undefined') {
		observer = new IntersectionObserver((entries) => {
			visible = entries.some((entry) => entry.isIntersecting);
			update();
		});
		observer.observe(node);
	} else {
		checkVisibility();
		window.addEventListener('scroll', checkVisibility, { passive: true });
		window.addEventListener('resize', checkVisibility);
	}

	return () => {
		disposed = true;
		job.dispose();
		observer?.disconnect();
		node.removeEventListener('load', handlePreviewReady);
		node.removeEventListener('error', handlePreviewReady);
		window.removeEventListener('load', handlePageReady);
		window.removeEventListener('scroll', checkVisibility);
		window.removeEventListener('resize', checkVisibility);
		if (preload) preload.src = '';
	};
};
