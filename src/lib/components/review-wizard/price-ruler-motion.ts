// Mirrors the iOS PriceRulerMotion so the ruler feels the same on every client.

/** About 95% of the velocity is lost in half a second. */
const FRICTION = 6;
/** Krona per second; bounds work and travel even for an erroneous gesture sample. */
const MAX_VELOCITY = 300;
const MIN_FLING_VELOCITY = 3;
const SETTLE_VELOCITY = 1;
/** Only pointer samples this recent count towards the release velocity. */
const SAMPLE_WINDOW_MS = 100;
/** A finger that rests this long before lifting releases without a fling. */
const PAUSE_MS = 50;

export interface PriceRulerRange {
	min: number;
	max: number;
}

export interface PointerSample {
	x: number;
	t: number;
}

/** Position is continuous; the form receives the nearest whole krona. */
export class PriceRulerMotion {
	position: number;
	velocity = 0;

	constructor(
		value: number,
		private readonly range: PriceRulerRange
	) {
		this.position = Number.isFinite(value) ? this.clamp(value) : range.min;
	}

	get selected() {
		return Math.round(this.position);
	}

	get isMoving() {
		return this.velocity !== 0;
	}

	drag(value: number) {
		this.velocity = 0;
		if (Number.isFinite(value)) this.position = this.clamp(value);
	}

	stop() {
		this.velocity = 0;
		this.position = Math.round(this.position);
	}

	release(velocity: number, reduceMotion: boolean) {
		const { min, max } = this.range;
		if (
			reduceMotion ||
			!Number.isFinite(velocity) ||
			Math.abs(velocity) < MIN_FLING_VELOCITY ||
			min >= max ||
			(this.position <= min && velocity < 0) ||
			(this.position >= max && velocity > 0)
		) {
			this.stop();
			return;
		}
		this.velocity = Math.min(Math.max(velocity, -MAX_VELOCITY), MAX_VELOCITY);
	}

	advance(seconds: number) {
		if (!this.isMoving || !Number.isFinite(seconds) || seconds <= 0) return;
		// Integrate exponential friction analytically: dropped frames do not change the travel.
		const decay = Math.exp(-FRICTION * seconds);
		this.position = this.clamp(this.position + (this.velocity / FRICTION) * (1 - decay));
		this.velocity *= decay;
		if (
			this.position <= this.range.min ||
			this.position >= this.range.max ||
			Math.abs(this.velocity) < SETTLE_VELOCITY
		) {
			this.stop();
		}
	}

	private clamp(value: number) {
		return Math.min(Math.max(value, this.range.min), this.range.max);
	}
}

/** Ruler velocity in krona per second from recent pointer samples. Dragging left raises the price. */
export function releaseVelocity(samples: PointerSample[], now: number, spacing: number) {
	const recent = samples.filter((sample) => sample.t >= now - SAMPLE_WINDOW_MS);
	if (recent.length < 2) return 0;
	const first = recent[0];
	const last = recent[recent.length - 1];
	if (now - last.t > PAUSE_MS || last.t <= first.t) return 0;
	return -((last.x - first.x) / spacing / (last.t - first.t)) * 1000;
}
