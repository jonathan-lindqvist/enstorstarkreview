import type { ReviewImageDimensions } from '$lib/types/review-image';

interface ReviewImageCallbacks {
	loaded(dimensions: ReviewImageDimensions): void;
	failed(): void;
}

/** Report image readiness to its owner without changing sources or layout attributes. */
export const prepareReviewImage = (
	node: HTMLImageElement,
	callbacks: ReviewImageCallbacks
): (() => void) => {
	let failed = false;
	let reportedDimensions = false;
	const loaded = () => {
		if (!failed && !reportedDimensions && node.naturalWidth && node.naturalHeight) {
			reportedDimensions = true;
			callbacks.loaded({ width: node.naturalWidth, height: node.naturalHeight });
		}
	};
	const error = () => {
		if (failed) return;
		failed = true;
		callbacks.failed();
	};
	node.addEventListener('load', loaded);
	node.addEventListener('error', error);
	if (node.complete) {
		if (node.naturalWidth) loaded();
		else error();
	}
	return () => {
		node.removeEventListener('load', loaded);
		node.removeEventListener('error', error);
	};
};
