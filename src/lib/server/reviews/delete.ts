import type { AuditEventInput } from '$lib/server/audit';
import type { SoftDeleteReviewResult } from '$lib/server/review-deletion';

export interface DeleteReviewDependencies {
	softDelete(slug: string, deletedBy: string, now: Date): Promise<SoftDeleteReviewResult>;
	invalidatePublicViews(): void;
	audit(event: AuditEventInput): Promise<void>;
	now(): Date;
}

export type DeleteReviewResult =
	| { ok: true }
	| {
			ok: false;
			status: 404 | 409 | 500;
			code: 'not_found' | 'concurrent_update' | 'storage_failed';
			message: string;
	  };

const notFound = {
	ok: false,
	status: 404,
	code: 'not_found',
	message: 'Recensionen hittades inte'
} as const;

/**
 * Soft-deletes a review for an authenticated user. Like publication, any signed-in user may
 * delete any review. The caller authenticates, sanitizes the route slug (null when invalid)
 * and maps the result to its response format.
 */
export const deleteReview = async (
	slug: string | null,
	context: { username: string; ip: string },
	deps: DeleteReviewDependencies
): Promise<DeleteReviewResult> => {
	const { username, ip } = context;
	const audit = (event: Omit<AuditEventInput, 'eventType' | 'username' | 'ip'>) =>
		deps.audit({ eventType: 'review_delete', username, ip, ...event });

	await audit({ outcome: 'attempt', targetSlug: slug ?? undefined });

	if (!slug) {
		await audit({ outcome: 'failure', reason: 'invalid_slug' });
		return notFound;
	}

	try {
		const result = await deps.softDelete(slug, username, deps.now());
		if (result.outcome === 'not_found') {
			await audit({ outcome: 'failure', targetSlug: slug, reason: 'review_not_found' });
			return notFound;
		}

		const targetId = result.review._id.toString();
		if (result.outcome === 'conflict') {
			await audit({
				outcome: 'failure',
				targetSlug: slug,
				targetId,
				reason: 'review_state_changed'
			});
			return {
				ok: false,
				status: 409,
				code: 'concurrent_update',
				message: 'Recensionen ändrades samtidigt. Ladda om sidan och försök igen.'
			};
		}

		deps.invalidatePublicViews();
		await audit({ outcome: 'success', targetSlug: slug, targetId });
		return { ok: true };
	} catch (err) {
		console.error('Review delete failed:', err);
		await audit({ outcome: 'failure', targetSlug: slug, reason: 'delete_failed' });
		return {
			ok: false,
			status: 500,
			code: 'storage_failed',
			message: 'Kunde inte ta bort recensionen'
		};
	}
};
