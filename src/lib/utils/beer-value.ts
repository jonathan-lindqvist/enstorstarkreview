import { isValidBeerPriceKr } from './price';

export const MIN_BEER_VOLUME_CL = 1;
export const MAX_BEER_VOLUME_CL = 200;

export const isValidBeerVolumeCl = (value: unknown): value is number =>
	typeof value === 'number' &&
	Number.isInteger(value) &&
	value >= MIN_BEER_VOLUME_CL &&
	value <= MAX_BEER_VOLUME_CL;

export const beerKrPerCl = (volume: unknown, price: number | null | undefined): number | null =>
	isValidBeerVolumeCl(volume) && isValidBeerPriceKr(price) ? price / volume : null;

export const formatKrPerClNumber = (value: number): string =>
	value.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatKrPerCl = (value: number): string => `${formatKrPerClNumber(value)} kr/cl`;
