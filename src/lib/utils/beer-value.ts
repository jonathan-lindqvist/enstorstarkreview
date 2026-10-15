import { isValidBeerPriceKr } from './price';

export const MIN_BEER_VOLUME_CL = 1;
export const MAX_BEER_VOLUME_CL = 200;

export const isValidBeerVolumeCl = (value: unknown): value is number =>
	typeof value === 'number' &&
	Number.isInteger(value) &&
	value >= MIN_BEER_VOLUME_CL &&
	value <= MAX_BEER_VOLUME_CL;

export const beerClPerKr = (volume: unknown, price: number | null | undefined): number | null =>
	isValidBeerVolumeCl(volume) && isValidBeerPriceKr(price) ? volume / price : null;

export const formatClPerKr = (value: number): string =>
	`${value.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} cl/kr`;
