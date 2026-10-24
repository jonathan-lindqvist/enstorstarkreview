import { describe, expect, it } from 'vitest';
import { variables } from './env';

describe('private runtime configuration', () => {
	it.each([undefined, ''])('rejects missing MongoDB configuration: %s', async (value) => {
		expect(await variables.MONGO_URI.schema['~standard'].validate(value)).toEqual({
			issues: [{ message: 'MONGO_URI is required' }]
		});
	});

	it('retains the runtime database value', async () => {
		const uri = 'mongodb://127.0.0.1:27027/enstorstark';
		expect(await variables.MONGO_URI.schema['~standard'].validate(uri)).toEqual({ value: uri });
	});

	it.each([undefined, '', 'http://127.0.0.1:4174/webhook'])(
		'leaves optional delivery configuration to the delivery workflow: %s',
		async (value) => {
			expect(
				await variables.REVIEW_REQUEST_DISCORD_WEBHOOK_URL.schema['~standard'].validate(value)
			).toEqual({ value });
		}
	);
});
