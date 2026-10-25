import { Context, Effect, Layer } from 'effect';
import { ReviewMap } from '$lib/server/map/service';
import { ReviewStatistics } from '$lib/server/review-statistics';

/** Invalidates every in-process cache of public review data after a public write. */
export class PublicReviewViews extends Context.Service<
	PublicReviewViews,
	{ readonly invalidate: Effect.Effect<void> }
>()('enstorstark/reviews/PublicReviewViews') {
	static readonly layer = Layer.effect(
		PublicReviewViews,
		Effect.gen(function* () {
			const statistics = yield* ReviewStatistics;
			const map = yield* ReviewMap;
			return PublicReviewViews.of({
				invalidate: Effect.andThen(statistics.invalidate, map.invalidate)
			});
		})
	);
}
