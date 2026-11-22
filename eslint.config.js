import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import { browserRules } from './scripts/lint/browser-rules.js';
import { serverRules } from './scripts/lint/server-rules.js';

const appTestsAndDeclarations = ['**/*.{test,spec}.{js,ts}', '**/*.d.ts'];
const serverFiles = [
	'src/lib/server/**',
	'src/lib/db/**',
	'**/*.server.{js,ts}',
	'**/+server.{js,ts}'
];

/** @type {import('eslint').Linter.Config[]} */
export default [
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		}
	},
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parserOptions: {
				parser: ts.parser
			}
		}
	},
	{
		ignores: [
			'build/',
			'.svelte-kit/',
			'dist/',
			'playwright-report/',
			'test-results/',
			'coverage/',
			'ci-output/'
		]
	},
	{
		rules: {
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					args: 'all',
					argsIgnorePattern: '^_',
					caughtErrors: 'all',
					caughtErrorsIgnorePattern: '^_',
					destructuredArrayIgnorePattern: '^_',
					varsIgnorePattern: '^_'
				}
			]
		}
	},
	{
		plugins: { enstorstark: { rules: { ...browserRules, ...serverRules } } }
	},
	{
		files: ['src/{lib,routes}/**/*.{js,ts,svelte}'],
		ignores: [...appTestsAndDeclarations, ...serverFiles],
		rules: { 'enstorstark/no-server-import-in-shared': 'error' }
	},
	{
		files: ['src/{lib,routes}/**/*.{js,ts,svelte}'],
		ignores: [...appTestsAndDeclarations, ...serverFiles, 'src/lib/client/user-location.ts'],
		rules: { 'enstorstark/use-location-helper': 'error' }
	},
	{
		files: ['src/routes/api/v1/**/+server.{js,ts}'],
		rules: { 'enstorstark/require-api-handler': 'error' }
	},
	{
		files: ['src/routes/api/v1/**/*.{js,ts}'],
		ignores: appTestsAndDeclarations,
		rules: { 'enstorstark/use-api-json-body': 'error' }
	},
	{
		files: ['src/**/*.{js,ts}'],
		ignores: appTestsAndDeclarations,
		rules: { 'enstorstark/review-collection-boundary': 'error' }
	}
];
