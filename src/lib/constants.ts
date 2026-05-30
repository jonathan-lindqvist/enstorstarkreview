export const MAX_REVIEW_IMAGE_SIZE_MB = 25;
export const MAX_REVIEW_IMAGE_SIZE_BYTES = MAX_REVIEW_IMAGE_SIZE_MB * 1024 * 1024;
export const ALLOWED_REVIEW_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const REVIEW_IMAGE_ACCEPT = ALLOWED_REVIEW_IMAGE_MIME_TYPES.join(',');
export const REVIEW_IMAGE_ALLOWED_TYPES_LABEL = 'JPEG, PNG och WebP';

export const descriptionTemplate = `## Ditt helhetsintryck

Beskriv vad som stack ut med den här baren. Vad gjorde den speciell, och vad kan bli bättre?

### Förslag på innehåll:
- Minnesvärda detaljer eller ögonblick
- Jämförelse med andra barer du har besökt
- Vem som skulle uppskatta baren mest
- Konkreta tips (vad man bör beställa, bästa tid att besöka, osv.)
- Något oväntat (positivt eller negativt)

Använd reglagen ovan för detaljerade betyg, och använd det här fältet för din personliga kommentar.`;
