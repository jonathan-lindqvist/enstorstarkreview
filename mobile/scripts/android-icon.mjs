// Generates the Android launcher icon from the iOS icon sources in Darwin/AppIcon.icon.
// Run from the repository root (uses the root `sharp` dependency):
//   node mobile/scripts/android-icon.mjs
//
// Layers follow Darwin/AppIcon.icon/icon.json: a dark vertical gradient, the amber glow at 60%,
// and the logo with a soft shadow on top. Android launchers mask adaptive icons to different
// shapes, so the logo is scaled to fit the safe zone. The monochrome layer (themed icons,
// Android 13+) uses the logo's dark outlines as line art.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const mobile = join(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(mobile, 'Darwin/AppIcon.icon/Assets');
const res = join(mobile, 'Android/app/src/main/res');

// Adaptive layers are 108 dp; legacy icons are 48 dp.
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const MASTER = 1024;
// Radius, as a fraction of the 108 dp canvas, that the farthest logo pixel may reach. Android
// guarantees a 66 dp circle (0.306); the circular mask shows 72 dp (0.333). Only the tips of the
// ribbon come near this edge.
const LOGO_RADIUS = 0.32;
// Pixels darker than this (0–255 luminance) count as outline for the monochrome layer.
const OUTLINE_LUMINANCE = 90;

const gradient = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${MASTER}" height="${MASTER}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2c2926"/>
      <stop offset="1" stop-color="#080808"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
</svg>`);

/** The farthest opaque logo pixel from the image centre, in pixels. */
const logoRadius = async (logo) => {
	const { data, info } = await sharp(logo).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
	const cx = info.width / 2;
	const cy = info.height / 2;
	let max = 0;
	for (let y = 0; y < info.height; y++) {
		for (let x = 0; x < info.width; x++) {
			if (data[(y * info.width + x) * 4 + 3] > 24) {
				max = Math.max(max, Math.hypot(x + 0.5 - cx, y + 0.5 - cy));
			}
		}
	}
	return max;
};

/** Scales the logo so its farthest pixel lands on LOGO_RADIUS, centred on a MASTER canvas. */
const placedLogo = async (logo) => {
	const scale = (LOGO_RADIUS * MASTER) / (await logoRadius(logo));
	const size = Math.round(MASTER * scale);
	const resized = await sharp(logo).resize(size, size).png().toBuffer();
	const offset = Math.round((MASTER - size) / 2);
	return sharp({
		create: { width: MASTER, height: MASTER, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
	})
		.composite([{ input: resized, left: offset, top: offset }])
		.png()
		.toBuffer();
};

/** A soft, slightly lowered shadow from the logo's alpha, like iOS's neutral shadow at 50%. */
const shadowOf = async (logo) => {
	const alpha = await sharp(logo).extractChannel('alpha').toBuffer();
	const black = await sharp({
		create: { width: MASTER, height: MASTER, channels: 3, background: { r: 0, g: 0, b: 0 } }
	})
		.joinChannel(alpha)
		.png()
		.toBuffer();
	const { data, info } = await sharp(black).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
	for (let i = 3; i < data.length; i += 4) data[i] = Math.round(data[i] * 0.5);
	const faded = await sharp(data, { raw: info }).png().toBuffer();
	const blurred = await sharp(faded).blur(MASTER * 0.012).png().toBuffer();
	return sharp({
		create: { width: MASTER, height: MASTER, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
	})
		.composite([{ input: blurred, left: 0, top: Math.round(MASTER * 0.012) }])
		.png()
		.toBuffer();
};

/** White line art: the logo's dark outline pixels, everything else transparent. */
const monochromeOf = async (logo) => {
	const { data, info } = await sharp(logo).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
	const out = Buffer.alloc(data.length);
	for (let i = 0; i < data.length; i += 4) {
		const luminance = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
		const outline = Math.max(0, Math.min(1, (OUTLINE_LUMINANCE + 30 - luminance) / 60));
		out[i] = out[i + 1] = out[i + 2] = 255;
		out[i + 3] = Math.round(outline * data[i + 3]);
	}
	return sharp(out, { raw: info }).png().toBuffer();
};

const logo = await placedLogo(join(assets, 'logo.png'));
// The source logo already has the margins of the iOS icon, which suit square icons.
const squareLogo = await sharp(join(assets, 'logo.png')).resize(MASTER, MASTER).png().toBuffer();
const glow = await sharp(join(assets, 'glow.png'))
	.resize(MASTER, MASTER)
	.ensureAlpha()
	.raw()
	.toBuffer({ resolveWithObject: true })
	.then(({ data, info }) => {
		for (let i = 3; i < data.length; i += 4) data[i] = Math.round(data[i] * 0.6);
		return sharp(data, { raw: info }).png().toBuffer();
	});

const background = await sharp(gradient).composite([{ input: glow }]).png().toBuffer();
const foreground = await sharp(await shadowOf(logo))
	.composite([{ input: logo }])
	.png()
	.toBuffer();
const monochrome = await monochromeOf(logo);
// Legacy and store icons: the layers flattened on the full square, with the logo at its iOS size.
const flattened = await sharp(background)
	.composite([{ input: await shadowOf(squareLogo) }, { input: squareLogo }])
	.png()
	.toBuffer();

const write = async (path, input, size) => {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, await sharp(input).resize(size, size).png({ compressionLevel: 9 }).toBuffer());
};

for (const [density, factor] of Object.entries(densities)) {
	const dir = join(res, `mipmap-${density}`);
	await write(join(dir, 'ic_launcher_background.png'), background, 108 * factor);
	await write(join(dir, 'ic_launcher_foreground.png'), foreground, 108 * factor);
	await write(join(dir, 'ic_launcher_monochrome.png'), monochrome, 108 * factor);
	await write(join(dir, 'ic_launcher.png'), flattened, 48 * factor);
}
// The Play Console store listing asks for a 512 × 512 icon; Play applies its own mask.
await write(join(mobile, 'Android/play-store-icon.png'), flattened, 512);
console.log('Wrote Android launcher icons and Android/play-store-icon.png');
