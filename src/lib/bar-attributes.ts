import type { BarAttributeKey } from '$lib/types/bar-attributes';

export const BAR_ATTRIBUTES = [
	{ key: 'quiz', label: 'Quiz' },
	{ key: 'liveMusic', label: 'Livemusik' },
	{ key: 'boardGames', label: 'Brädspel' },
	{ key: 'shuffleboard', label: 'Shuffleboard' },
	{ key: 'darts', label: 'Dart' },
	{ key: 'billiards', label: 'Biljard' },
	{ key: 'karaoke', label: 'Karaoke' },
	{ key: 'sportsTv', label: 'Sport-TV' }
] as const satisfies readonly { key: BarAttributeKey; label: string }[];

export const normalizeBarAttributes = (value: unknown): BarAttributeKey[] => {
	if (!Array.isArray(value)) return [];
	return BAR_ATTRIBUTES.filter((attribute) => value.includes(attribute.key)).map(
		(attribute) => attribute.key
	);
};

export const matchesBarAttributes = (
	attributes: readonly BarAttributeKey[] | undefined,
	selected: readonly BarAttributeKey[]
): boolean => selected.length === 0 || selected.some((key) => attributes?.includes(key));

export const getBarAttributeLabels = (value: unknown): string[] => {
	const attributes = normalizeBarAttributes(value);
	return BAR_ATTRIBUTES.filter((attribute) => attributes.includes(attribute.key)).map(
		(attribute) => attribute.label
	);
};

export const setBarAttributeParams = (
	params: URLSearchParams,
	attributes: readonly BarAttributeKey[]
): void => {
	params.delete('attributes');
	for (const key of normalizeBarAttributes(attributes)) params.append('attributes', key);
};
