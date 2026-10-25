import { Context, Duration, Effect, Layer, Option, Redacted, Schema } from 'effect';
import type { ReviewRequestSubmission } from '$lib/types/review-request';
import { AppConfig } from '$lib/server/platform/config';

export const REVIEW_REQUEST_DISCORD_TIMEOUT = Duration.seconds(5);

/** Production has no webhook configured. */
export class ReviewRequestConfigurationError extends Schema.TaggedError<ReviewRequestConfigurationError>()(
	'ReviewRequestConfigurationError',
	{ message: Schema.String }
) {}

/** Discord did not accept the request: transport error, timeout or non-2xx status. */
export class ReviewRequestDeliveryError extends Schema.TaggedError<ReviewRequestDeliveryError>()(
	'ReviewRequestDeliveryError',
	{ message: Schema.String }
) {}

export const buildReviewRequestDiscordPayload = (submission: ReviewRequestSubmission) => ({
	username: 'En Stor Stark Review',
	allowed_mentions: { parse: [] as string[] },
	embeds: [
		{
			title: 'Ny recensionsförfrågan',
			color: 0x0ea5e9,
			fields: [
				{ name: 'Bar', value: submission.barName },
				{ name: 'Ort eller adress', value: submission.location },
				{
					name: 'Motivering',
					value: submission.motivation || 'Ingen motivering angavs.'
				}
			],
			timestamp: submission.submittedAt.toISOString()
		}
	]
});

export type ReviewRequestDeliveryResult = 'discord' | 'development_sink';

type DeliverFailure = ReviewRequestConfigurationError | ReviewRequestDeliveryError;

/**
 * Sends review requests to Discord. There is deliberately no retry: a failed post may still
 * have arrived, and a retry would duplicate it. Each attempt is bounded by `Effect.timeout`
 * and the fetch is aborted when it is interrupted.
 */
export class ReviewRequestDelivery extends Context.Service<
	ReviewRequestDelivery,
	{
		deliver(
			submission: ReviewRequestSubmission
		): Effect.Effect<ReviewRequestDeliveryResult, DeliverFailure>;
	}
>()('enstorstark/review-requests/ReviewRequestDelivery') {
	static readonly make = (options: {
		webhookUrl: Option.Option<Redacted.Redacted<string>>;
		production: boolean;
		fetch?: typeof globalThis.fetch;
		timeout?: Duration.Input;
	}) =>
		ReviewRequestDelivery.of({
			deliver: (submission) =>
				Option.match(options.webhookUrl, {
					onNone: () =>
						options.production
							? Effect.fail(
									new ReviewRequestConfigurationError({
										message: 'REVIEW_REQUEST_DISCORD_WEBHOOK_URL is required'
									})
								)
							: Effect.succeed('development_sink' as const),
					onSome: (webhookUrl) =>
						Effect.tryPromise({
							try: async (signal) => {
								const response = await (options.fetch ?? globalThis.fetch)(
									Redacted.value(webhookUrl),
									{
										method: 'POST',
										headers: { 'content-type': 'application/json' },
										body: JSON.stringify(buildReviewRequestDiscordPayload(submission)),
										signal
									}
								);
								if (!response.ok) {
									throw new ReviewRequestDeliveryError({
										message: `Discord webhook returned HTTP ${response.status}`
									});
								}
								return 'discord' as const;
							},
							catch: (error) =>
								error instanceof ReviewRequestDeliveryError
									? error
									: new ReviewRequestDeliveryError({ message: 'Discord webhook request failed' })
						}).pipe(
							Effect.timeoutOrElse({
								duration: options.timeout ?? REVIEW_REQUEST_DISCORD_TIMEOUT,
								orElse: () =>
									Effect.fail(
										new ReviewRequestDeliveryError({ message: 'Discord webhook timed out' })
									)
							})
						)
				})
		});

	/** Reads the webhook from `REVIEW_REQUEST_DISCORD_WEBHOOK_URL`; without it, a local sink. */
	static readonly layer = Layer.effect(
		ReviewRequestDelivery,
		Effect.gen(function* () {
			const config = yield* AppConfig;
			return ReviewRequestDelivery.make({
				webhookUrl: config.discordWebhookUrl,
				production: config.production
			});
		})
	);

	/** Records submissions in `delivered` and never touches the network. */
	static readonly layerTest = (
		delivered: ReviewRequestSubmission[] = [],
		outcome: Effect.Effect<ReviewRequestDeliveryResult, DeliverFailure> = Effect.succeed('discord')
	) =>
		Layer.succeed(
			ReviewRequestDelivery,
			ReviewRequestDelivery.of({
				deliver: (submission) =>
					Effect.sync(() => delivered.push(submission)).pipe(Effect.andThen(outcome))
			})
		);
}
