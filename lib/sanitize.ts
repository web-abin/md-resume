import type { Config } from 'dompurify';

// No images, styles, scripts or embeds: importing a resume cannot request remote assets.
export const SANITIZE_CONFIG: Config = {
  ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'div', 'strong', 'em', 'del', 'ul', 'ol', 'li', 'a', 'br', 'hr', 'blockquote', 'code', 'pre', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
  ALLOWED_ATTR: ['href', 'title', 'class', 'start', 'align'],
};
