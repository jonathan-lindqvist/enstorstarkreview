const isDisallowedControlCharacter = (value: string): boolean => {
	const code = value.charCodeAt(0);
	return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127;
};

export const stripControlCharacters = (value: string): string => {
	return Array.from(value)
		.filter((character) => !isDisallowedControlCharacter(character))
		.join('');
};

export const sanitizePlainText = (value: string): string => {
	return stripControlCharacters(value).replace(/\s+/g, ' ').trim();
};

export const sanitizeLongText = (value: string): string => {
	return stripControlCharacters(value).trim();
};
