import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { findMarkdownFiles, formatMarkdown, splitSentences } from './sentence-lines.js';

test('joins wrapped prose and breaks it after every sentence', () => {
	assert.equal(
		formatMarkdown('One sentence that\nwraps. Two short. Three\nhere.\n'),
		'One sentence that wraps.\nTwo short.\nThree here.\n'
	);
});

test('formatting is idempotent', () => {
	const once = formatMarkdown('- Item one. Item\n  two.\n\nText. More `a. B` text.\n');
	assert.equal(formatMarkdown(once), once);
});

test('indents list continuations to the item content', () => {
	assert.equal(
		formatMarkdown('- First. Second\n  wraps.\n10. Ten. Eleven.\n'),
		'- First.\n  Second wraps.\n10. Ten.\n    Eleven.\n'
	);
});

test('formats indented paragraphs inside list items', () => {
	assert.equal(
		formatMarkdown('1. Item.\n\n   Inner one. Inner\n   two.\n'),
		'1. Item.\n\n   Inner one.\n   Inner two.\n'
	);
});

test('does not split inside code, links or abbreviations', () => {
	assert.deepEqual(splitSentences('Run `a. B` now. Use e.g. Node and [A. B](x.y) here.'), [
		'Run `a. B` now.',
		'Use e.g. Node and [A. B](x.y) here.'
	]);
	assert.deepEqual(splitSentences('Version 2. then lower. ok'), ['Version 2. then lower. ok']);
});

test('keeps closing punctuation with its sentence', () => {
	assert.deepEqual(splitSentences('Say "hi." Then (go.) **Bold.** Next'), [
		'Say "hi."',
		'Then (go.)',
		'**Bold.**',
		'Next'
	]);
});

test('never starts a line with a list marker', () => {
	assert.deepEqual(splitSentences('End. * not a list'), ['End. * not a list']);
});

test('leaves code, tables, headings, quotes, HTML and front matter alone', () => {
	const source = [
		'---',
		'name: x. Y.',
		'---',
		'# Heading. Two.',
		'',
		'```',
		'code. More',
		'wrapped',
		'```',
		'',
		'| A. B | C |',
		'> Quote. Two',
		'> wrapped.',
		'<p>Html. Two</p>',
		'',
		'    indented code. Two',
		'    lines',
		''
	].join('\n');
	assert.equal(formatMarkdown(source), source);
});

test('keeps hard line breaks', () => {
	assert.equal(formatMarkdown('Line one  \nline two.\n'), 'Line one  \nline two.\n');
	assert.equal(formatMarkdown('One. Two\\\nthree.\n'), 'One.\nTwo\\\nthree.\n');
});

test('finds Markdown outside dependency, output and hidden directories', () => {
	const root = mkdtempSync(join(tmpdir(), 'sentence-lines-'));
	try {
		for (const directory of ['docs', 'node_modules/x', '.impeccable', '.agents', 'coverage']) {
			mkdirSync(join(root, directory), { recursive: true });
			writeFileSync(join(root, directory, 'a.md'), '');
		}
		writeFileSync(join(root, 'README.md'), '');
		writeFileSync(join(root, 'notes.txt'), '');
		assert.deepEqual(
			findMarkdownFiles(root)
				.map((file) => file.slice(root.length + 1))
				.sort(),
			['.agents/a.md', 'README.md', 'docs/a.md']
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('compacts tables and keeps Prettier from padding them', () => {
	const compact = [
		'Intro.',
		'',
		'<!-- prettier-ignore -->',
		'| Rule | Owner `a \\| b` |',
		'| :--- | ---: |',
		'| Long row | x |',
		''
	].join('\n');
	assert.equal(
		formatMarkdown(
			'Intro.\n\n| Rule     | Owner `a \\| b` |\n| :------- | -----------: |\n| Long row |            x |\n'
		),
		compact
	);
	assert.equal(formatMarkdown(compact), compact);
	assert.equal(
		formatMarkdown('Text.\n| A | B |\n| - | - |\n'),
		'Text.\n\n<!-- prettier-ignore -->\n| A | B |\n| --- | --- |\n'
	);
});
