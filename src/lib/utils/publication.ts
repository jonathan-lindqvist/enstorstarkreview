import type { ReviewPublicationStatus } from '$lib/types/bar-review';

export interface ReviewPublicationBadge {
	label: 'Utkast' | 'Publicerad';
	tone: 'amber' | 'green';
}

export const getReviewPublicationBadge = (
	status: ReviewPublicationStatus | undefined
): ReviewPublicationBadge =>
	status === 'draft' ? { label: 'Utkast', tone: 'amber' } : { label: 'Publicerad', tone: 'green' };
