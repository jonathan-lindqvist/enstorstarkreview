// A short haptic and click for each krona the ruler passes. Both are best effort:
// `navigator.vibrate` is missing on iOS Safari, and audio needs a prior user gesture.

/** Fast flings pass many krona per frame; more feedback than this is a buzz, not ticks. */
const MIN_INTERVAL_MS = 35;

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

export function createTickFeedback() {
	let audio: AudioContext | null = null;
	let click: AudioBuffer | null = null;
	let last = -Infinity;

	return {
		/** Call from a pointer or key event so browsers allow audio to start. */
		prepare() {
			if (audio || typeof AudioContext === 'undefined') return;
			try {
				// Mix with other audio and respect the iOS silent switch.
				const session = (navigator as AudioSessionNavigator).audioSession;
				if (session) session.type = 'ambient';
				audio = new AudioContext();
			} catch {
				audio = null;
			}
		},
		tick(now: number) {
			if (now - last < MIN_INTERVAL_MS) return;
			last = now;
			navigator.vibrate?.(4);
			if (!audio) return;
			if (audio.state === 'suspended') void audio.resume();
			click ??= renderClick(audio);
			const source = audio.createBufferSource();
			source.buffer = click;
			// Slight pitch variation so a run of ticks does not sound like a machine gun.
			source.playbackRate.value = 0.95 + Math.random() * 0.1;
			source.connect(audio.destination);
			source.start();
		},
		dispose() {
			void audio?.close();
			audio = null;
			click = null;
		}
	};
}

/** A watch-like tick: a sharp, bright noise transient with a short high ring. */
function renderClick(audio: AudioContext) {
	const rate = audio.sampleRate;
	const buffer = audio.createBuffer(1, Math.ceil(rate * 0.01), rate);
	const samples = buffer.getChannelData(0);
	let previous = 0;
	for (let i = 0; i < samples.length; i++) {
		const t = i / rate;
		const noise = Math.random() * 2 - 1;
		// Differencing white noise high-passes it into a crisp snap.
		const snap = (noise - previous) * Math.exp(-t / 0.0012);
		previous = noise;
		// A short, high resonance gives the tick its pitch; nothing low enough to rumble.
		const ping = Math.sin(2 * Math.PI * 3800 * t) * Math.exp(-t / 0.0015);
		samples[i] = 0.25 * snap + 0.15 * ping;
	}
	return buffer;
}
