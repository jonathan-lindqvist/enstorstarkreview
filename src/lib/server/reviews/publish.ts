import type { AuditEventInput } from '$lib/server/audit';
import type { PublishDraftReviewResult } from '$lib/server/review-publication';

export interface PublishReviewDependencies {
	publishDraft(slug: string, publisher: string, now: Date): Promise<PublishDraftReviewResult>;
	invalidatePublicViews(): void;
	audit(event: AuditEventInput): Promise<void>;
	now(): Date;
}

export type PublishReviewResult =
	| { ok: true; slug: string }
	| {
			ok: false;
			status: 404 | 409 | 500;
			code: 'not_found' | 'already_published' | 'concurrent_update' | 'storage_failed';
			message: string;
	  };

/**
 * Publishes a draft for an authenticated user. The caller authenticates, sanitizes the route
 * slug (null when invalid) and maps the result to its response format.
 */
export const publishReview = async (
	slug: string | null,
	context: { username: string; ip: string },
	deps: PublishReviewDependencies
): Promise<PublishReviewResult> => {
	const { username, ip } = context;
	const audit = (event: Omit<AuditEventInput, 'eventType' | 'username' | 'ip'>) =>
		deps.audit({ eventType: 'review_publish', username, ip, ...event });

	await audit({ outcome: 'attempt', targetSlug: slug ?? undefined });

	if (!slug) {
		await audit({ outcome: 'failure', reason: 'invalid_slug' });
		return { ok: false, status: 404, code: 'not_found', message: 'Recensionen hittades inte' };
	}

	try {
		const result = await deps.publishDraft(slug, username, deps.now());
		if (result.outcome === 'not_found') {
			await audit({ outcome: 'failure', targetSlug: slug, reason: 'review_not_found' });
			return { ok: false, status: 404, code: 'not_found', message: 'Recensionen hittades inte' };
		}

		const targetId = result.review._id.toString();
		if (result.outcome === 'already_published') {
			await audit({ outcome: 'failure', targetSlug: slug, targetId, reason: 'already_published' });
			return {
				ok: false,
				status: 409,
				code: 'already_published',
				message: 'Recensionen är redan publicerad'
			};
		}

		if (result.outcome === 'conflict') {
			await audit({
				outcome: 'failure',
				targetSlug: slug,
				targetId,
				reason: 'publication_state_changed'
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
		return { ok: true, slug };
	} catch (err) {
		console.error('Review publish failed:', err);
		await audit({ outcome: 'failure', targetSlug: slug, reason: 'publish_failed' });
		return {
			ok: false,
			status: 500,
			code: 'storage_failed',
			message: 'Kunde inte publicera recensionen'
		};
	}
};
