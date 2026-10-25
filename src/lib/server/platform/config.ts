import { isAbsolute, join, resolve } from 'node:path';
import { Config, ConfigProvider, Context, Effect, Layer, Option, Redacted } from 'effect';

const PRODUCTION_REVIEW_IMAGE_DIRECTORY = '/app/uploads/images';

export interface AppConfigShape {
	readonly mongoUri: Redacted.Redacted<string>;
	readonly production: boolean;
	/** Trust `x-forwarded-for` / `x-real-ip` only behind the production proxy. */
	readonly trustProxy: boolean;
	readonly reviewImageDirectory: string;
	readonly discordWebhookUrl: Option.Option<Redacted.Redacted<string>>;
}

/**
 * Environment configuration, read once through Effect `Config`. The values stay redacted where
 * they are secrets, so a logged config never leaks the Mongo URI or the Discord webhook.
 */
export class AppConfig extends Context.Service<AppConfig, AppConfigShape>()(
	'enstorstark/platform/AppConfig'
) {
	static readonly load = Effect.gen(function* () {
		const production =
			(yield* Config.String('NODE_ENV').pipe(Config.withDefault(''))) === 'production';
		const configuredImageDirectory = (yield* Config.String('REVIEW_IMAGE_DIR').pipe(
			Config.withDefault('')
		)).trim();
		const webhook = yield* Config.option(Config.Redacted('REVIEW_REQUEST_DISCORD_WEBHOOK_URL'));
		return AppConfig.of({
			mongoUri: yield* Config.Redacted('MONGO_URI'),
			production,
			trustProxy: (yield* Config.String('TRUST_PROXY').pipe(Config.withDefault(''))) === 'true',
			reviewImageDirectory: configuredImageDirectory
				? isAbsolute(configuredImageDirectory)
					? configuredImageDirectory
					: resolve(process.cwd(), configuredImageDirectory)
				: production
					? PRODUCTION_REVIEW_IMAGE_DIRECTORY
					: join(process.cwd(), 'uploads', 'images'),
			discordWebhookUrl: Option.filter(webhook, (url) => Redacted.value(url).trim().length > 0)
		});
	});

	/** Reads SvelteKit's private environment, which includes `.env` during development. */
	static readonly layerFromEnv = (env: Record<string, string | undefined>) =>
		Layer.effect(AppConfig, AppConfig.load).pipe(
			Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnvRecord(env)))
		);

	static readonly layerTest = (overrides: Partial<AppConfigShape> = {}) =>
		Layer.succeed(
			AppConfig,
			AppConfig.of({
				mongoUri: Redacted.make('mongodb://test'),
				production: false,
				trustProxy: false,
				reviewImageDirectory: join(process.cwd(), 'uploads', 'images'),
				discordWebhookUrl: Option.none(),
				...overrides
			})
		);
}
