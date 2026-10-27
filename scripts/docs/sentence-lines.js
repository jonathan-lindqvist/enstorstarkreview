import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

// Keeps Markdown prose at one sentence per line, so concurrent doc edits rarely touch the same
// line and a changed sentence never rewraps the rest of its paragraph.

const fencePattern = /^\s*(`{3,}|~{3,})/;
const listItemPattern = /^(\s*)([-*+]|\d{1,9}[.)])( +|$)/;
const thematicBreakPattern = /^\s*([-*_])(\s*\1){2,}\s*$/;
// Headings, tables, HTML, blockquotes and link definitions keep their line breaks.
const leafPattern = /^\s*(#{1,6}(\s|$)|\||<|>|\[[^\]]+\]:)/;
const hardBreakPattern = /( {2,}|\\)$/;
const closingPunctuation = `)"'*_”’`;
const abbreviations = new Set([
	'bl.a.',
	'ca.',
	'cf.',
	'dvs.',
	'e.g.',
	'etc.',
	'fig.',
	'i.e.',
	'incl.',
	'inkl.',
	'jfr.',
	'm.fl.',
	'no.',
	'nr.',
	'osv.',
	'resp.',
	's.k.',
	't.ex.',
	'vs.'
]);

const isBlank = (line) => line.trim() === '';
const startsBlock = (line) =>
	isBlank(line) ||
	fencePattern.test(line) ||
	thematicBreakPattern.test(line) ||
	leafPattern.test(line) ||
	listItemPattern.test(line);

function isAbbreviation(text, dot) {
	let start = dot;
	while (start > 0 && !/[\s([`"'*_]/.test(text[start - 1])) start--;
	const word = text.slice(start, dot + 1).toLowerCase();
	return abbreviations.has(word) || /^\p{L}\.$/u.test(word);
}

// A new sentence starts with a capital, code, a link, emphasis or an opening quote. An asterisk
// followed by a space would become a list item, so it never starts a line.
const startsSentence = (rest) => /^(\p{Lu}|[`["“(_]|\*[^\s])/u.test(rest);

function skipLinkDestination(text, open) {
	let depth = 0;
	for (let index = open; index < text.length; index++) {
		if (text[index] === '(') depth++;
		else if (text[index] === ')' && --depth === 0) return index + 1;
	}
	return text.length;
}

export function splitSentences(text) {
	const sentences = [];
	let start = 0;
	let brackets = 0;
	for (let index = 0; index < text.length; ) {
		const character = text[index];
		if (character === '`') {
			const ticks = text.slice(index).match(/^`+/)[0];
			const close = text.indexOf(ticks, index + ticks.length);
			index = close === -1 ? index + ticks.length : close + ticks.length;
			continue;
		}
		if (character === '<' && /^<(https?:|mailto:|\/?[a-z])/i.test(text.slice(index))) {
			const close = text.indexOf('>', index);
			index = close === -1 ? index + 1 : close + 1;
			continue;
		}
		if (character === '[') brackets++;
		if (character === ']') {
			brackets = Math.max(0, brackets - 1);
			if (text[index + 1] === '(') {
				index = skipLinkDestination(text, index + 1);
				continue;
			}
		}
		if (brackets === 0 && '.!?'.includes(character)) {
			let end = index + 1;
			while (end < text.length && closingPunctuation.includes(text[end])) end++;
			let next = end;
			while (text[next] === ' ') next++;
			if (
				next > end &&
				next < text.length &&
				startsSentence(text.slice(next)) &&
				!(character === '.' && isAbbreviation(text, index))
			) {
				sentences.push(text.slice(start, end));
				start = next;
				index = next;
				continue;
			}
		}
		index++;
	}
	sentences.push(text.slice(start));
	return sentences;
}

// Joins one paragraph or list item and breaks it again after every sentence, keeping hard breaks.
function formatBlock(lines) {
	const marker = lines[0].match(listItemPattern);
	const prefix = marker ? marker[0] : lines[0].match(/^\s*/)[0];
	const indent = ' '.repeat(prefix.length);
	const output = [];
	let parts = [];
	const flush = (lineBreak) => {
		const sentences = splitSentences(parts.join(' '));
		sentences[sentences.length - 1] += lineBreak;
		for (const sentence of sentences) output.push(`${output.length ? indent : prefix}${sentence}`);
		parts = [];
	};
	lines.forEach((line, index) => {
		const content = (index === 0 ? line.slice(prefix.length) : line).trim();
		const hardBreak = line.match(hardBreakPattern);
		if (content) parts.push(hardBreak?.[1] === '\\' ? content.slice(0, -1).trimEnd() : content);
		if (hardBreak && index < lines.length - 1) flush(hardBreak[1]);
	});
	if (parts.length) flush('');
	return output;
}

// Prettier pads every table cell to its column's widest cell, so one longer row rewrites the whole
// table; compact tables that Prettier ignores change only the edited row.
const tableIgnoreComment = '<!-- prettier-ignore -->';
const tableRowPattern = /^\s*\|/;
const tableSeparatorPattern = /^\s*\|(\s*:?-+:?\s*\|)+\s*$/;

function compactTableRow(row) {
	const cells = row
		.trim()
		.replace(/^\||(?<!\\)\|$/g, '')
		.split(/(?<!\\)\|/)
		.map((cell) => cell.trim());
	const separator = cells.every((cell) => /^:?-+:?$/.test(cell));
	const compact = separator ? cells.map((cell) => cell.replace(/-+/, '---')) : cells;
	return `| ${compact.join(' | ')} |`;
}

export function formatMarkdown(source) {
	const lines = source.split('\n');
	const output = [];
	let index = 0;
	if (lines[0] === '---') {
		const end = lines.indexOf('---', 1);
		if (end !== -1) {
			output.push(...lines.slice(0, end + 1));
			index = end + 1;
		}
	}
	// Indented paragraphs outside lists are code blocks.
	let inList = false;
	while (index < lines.length) {
		const line = lines[index];
		const fence = line.match(fencePattern);
		if (fence) {
			const [, ticks] = fence;
			output.push(line);
			index++;
			while (index < lines.length) {
				const closing = lines[index].trim();
				output.push(lines[index++]);
				if (closing.startsWith(ticks[0].repeat(ticks.length)) && /^[`~]+$/.test(closing)) break;
			}
			continue;
		}
		if (tableRowPattern.test(line)) {
			const end = lines.findIndex(
				(row, rowIndex) => rowIndex > index && !tableRowPattern.test(row)
			);
			const rows = lines.slice(index, end === -1 ? lines.length : end);
			index += rows.length;
			if (!tableSeparatorPattern.test(rows[1] ?? '')) {
				output.push(...rows);
				continue;
			}
			const indent = line.match(/^\s*/)[0];
			const previous = output.at(-1)?.trim();
			if (previous !== tableIgnoreComment) {
				if (previous) output.push('');
				output.push(`${indent}${tableIgnoreComment}`);
			}
			output.push(...rows.map((row) => `${indent}${compactTableRow(row)}`));
			continue;
		}
		const listItem = listItemPattern.test(line) && !thematicBreakPattern.test(line);
		if (isBlank(line) || (!listItem && startsBlock(line))) {
			if (!isBlank(line)) inList = false;
			output.push(line);
			index++;
			continue;
		}
		const indented = /^( {4}|\t)/.test(line);
		if (listItem) inList = true;
		else if (!/^\s/.test(line)) inList = false;
		const block = [line];
		for (index++; index < lines.length && !startsBlock(lines[index]); index++) {
			block.push(lines[index]);
		}
		output.push(...(indented && !inList && !listItem ? block : formatBlock(block)));
	}
	return output.join('\n');
}

const skippedDirectories = new Set([
	'node_modules',
	'build',
	'coverage',
	'ci-output',
	'playwright-report',
	'test-results',
	'DerivedData'
]);

// Generated reports such as .impeccable critiques live in other dot directories.
const visibleDotDirectories = new Set(['.agents', '.github']);

export function findMarkdownFiles(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			const hidden = entry.name.startsWith('.') && !visibleDotDirectories.has(entry.name);
			return hidden || skippedDirectories.has(entry.name) ? [] : findMarkdownFiles(path);
		}
		return entry.isFile() && entry.name.endsWith('.md') ? [path] : [];
	});
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const [mode, ...paths] = process.argv.slice(2);
	if (mode !== '--check' && mode !== '--write') {
		console.error('Usage: sentence-lines.js --check|--write [file.md ...]');
		process.exit(2);
	}
	const files = paths.length ? paths : findMarkdownFiles('.').sort();
	const unformatted = files.filter((file) => {
		const source = readFileSync(file, 'utf8');
		const formatted = formatMarkdown(source);
		if (formatted === source) return false;
		if (mode === '--write') writeFileSync(file, formatted);
		return true;
	});
	for (const file of unformatted) {
		console.log(
			`${mode === '--write' ? 'Formatted' : 'Not one sentence per line:'} ${relative('.', file)}`
		);
	}
	if (mode === '--check' && unformatted.length) {
		console.log('Run `npm run format` to put each sentence on its own line.');
		process.exit(1);
	}
}
