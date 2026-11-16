/** Keep responsive cover crops sharp and use the original only after a derivative fails. */
export const prepareReviewImage = (node: HTMLImageElement, original: string): (() => void) => {
	if (node.getAttribute('src') === original) return () => undefined;
	let failed = false;

	const updateSize = () => {
		if (failed || !node.naturalWidth || !node.naturalHeight || !node.hasAttribute('srcset')) return;
		const box = node.getBoundingClientRect();
		// A landscape image is enlarged vertically to cover a square, so its slot is wider.
		const width = Math.ceil(
			Math.max(box.width, box.height * (node.naturalWidth / node.naturalHeight))
		);
		if (width > 0 && node.sizes !== `${width}px`) node.sizes = `${width}px`;
	};
	const fallback = () => {
		if (failed) return;
		failed = true;
		node.removeAttribute('srcset');
		node.removeAttribute('sizes');
		node.src = original;
	};
	node.addEventListener('load', updateSize);
	node.addEventListener('error', fallback);
	const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateSize);
	observer?.observe(node);
	if (node.complete) {
		if (node.naturalWidth) updateSize();
		else fallback();
	}

	return () => {
		observer?.disconnect();
		node.removeEventListener('load', updateSize);
		node.removeEventListener('error', fallback);
	};
};
