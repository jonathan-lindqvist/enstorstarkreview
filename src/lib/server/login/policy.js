// Dependency-free ESM: used by the app and the standalone user-creation script.
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 31;
export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 255;
export const ARGON2_OPTIONS = {
	memoryCost: 19456,
	timeCost: 2,
	hashLength: 32,
	parallelism: 1
};
