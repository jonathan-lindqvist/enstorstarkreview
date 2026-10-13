import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTickFeedback } from './price-ruler-feedback';

class FakeAudioContext {
	static instances: FakeAudioContext[] = [];
	state = 'running';
	sampleRate = 8000;
	currentTime = 0;
	destination = {};
	buffers: Float32Array[] = [];
	sources: { buffer: unknown; playbackRate: { value: number }; started: boolean }[] = [];
	resume = vi.fn(async () => {});
	close = vi.fn(async () => {});

	constructor() {
		FakeAudioContext.instances.push(this);
	}

	createBuffer(_channels: number, length: number) {
		const data = new Float32Array(length);
		this.buffers.push(data);
		return { getChannelData: () => data };
	}

	createBufferSource() {
		const source = {
			buffer: null as unknown,
			playbackRate: { value: 1 },
			started: false,
			connect: () => {},
			start: () => {
				source.started = true;
			}
		};
		this.sources.push(source);
		return source;
	}
}

function stubBrowser(navigatorExtras: Record<string, unknown> = {}) {
	const vibrate = vi.fn();
	vi.stubGlobal('navigator', { vibrate, ...navigatorExtras });
	vi.stubGlobal('AudioContext', FakeAudioContext);
	return vibrate;
}

afterEach(() => {
	FakeAudioContext.instances = [];
	vi.unstubAllGlobals();
});

describe('createTickFeedback', () => {
	it('vibrates but stays silent until prepared by a user gesture', () => {
		const vibrate = stubBrowser();
		createTickFeedback().tick(0);
		expect(vibrate).toHaveBeenCalledOnce();
		expect(FakeAudioContext.instances).toHaveLength(0);
	});

	it('plays a short, quiet click and reuses one rendered buffer', () => {
		stubBrowser();
		const feedback = createTickFeedback();
		feedback.prepare();
		feedback.prepare();
		feedback.tick(0);
		feedback.tick(100);

		const [audio] = FakeAudioContext.instances;
		expect(FakeAudioContext.instances).toHaveLength(1);
		expect(audio.buffers).toHaveLength(1);
		expect(audio.buffers[0]).toHaveLength(80);
		expect(Math.max(...audio.buffers[0].map(Math.abs))).toBeLessThanOrEqual(1);
		expect(audio.sources.map((source) => source.started)).toEqual([true, true]);
		for (const source of audio.sources) {
			expect(source.playbackRate.value).toBeGreaterThanOrEqual(0.95);
			expect(source.playbackRate.value).toBeLessThanOrEqual(1.05);
		}
	});

	it('throttles ticks that arrive faster than they can be heard apart', () => {
		const vibrate = stubBrowser();
		const feedback = createTickFeedback();
		feedback.prepare();
		for (const now of [0, 10, 20, 34, 35, 60]) feedback.tick(now);
		expect(vibrate).toHaveBeenCalledTimes(2);
		expect(FakeAudioContext.instances[0].sources).toHaveLength(2);
	});

	it('mixes with other audio and resumes a suspended context', () => {
		const audioSession = { type: 'auto' };
		stubBrowser({ audioSession });
		const feedback = createTickFeedback();
		feedback.prepare();
		const [audio] = FakeAudioContext.instances;
		audio.state = 'suspended';
		feedback.tick(0);
		expect(audioSession.type).toBe('ambient');
		expect(audio.resume).toHaveBeenCalledOnce();
	});

	it('degrades to silence without Web Audio, vibration, or when audio fails to start', () => {
		vi.stubGlobal('navigator', {});
		const noAudio = createTickFeedback();
		noAudio.prepare();
		expect(() => noAudio.tick(0)).not.toThrow();

		vi.stubGlobal(
			'AudioContext',
			class {
				constructor() {
					throw new Error('blocked');
				}
			}
		);
		const blocked = createTickFeedback();
		expect(() => blocked.prepare()).not.toThrow();
		expect(() => blocked.tick(0)).not.toThrow();
	});

	it('closes the audio context on dispose', () => {
		stubBrowser();
		const feedback = createTickFeedback();
		feedback.prepare();
		const [audio] = FakeAudioContext.instances;
		feedback.dispose();
		expect(audio.close).toHaveBeenCalledOnce();
		feedback.tick(0);
		expect(audio.sources).toHaveLength(0);
	});
});
