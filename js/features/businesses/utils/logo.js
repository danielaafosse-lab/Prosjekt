/**
 * Bedriftslogo-helper.
 *
 * Returnerer HTML for bedriftslogo — enten et bilde (hvis bedriften
 * har lastet opp en data-URL) eller en emoji som fallback.
 *
 * Først ekstrahert som demonstrasjon av fase 5b-mønsteret: ren
 * UI-helper-logikk flyttet ut av main.js til feature-mappen den
 * tilhører. Importeres via features/businesses/index.js.
 */

import { escapeHtml } from '../../../shared/utils/helpers.js';

const SIZE_CLASSES = {
  small: 'w-6 h-6',
  medium: 'w-8 h-8',
  large: 'w-12 h-12',
};

/**
 * @param {{ logo?: string, emoji?: string, name?: string }} business
 * @param {'small' | 'medium' | 'large'} [size='medium']
 * @returns {string} HTML-fragment
 */
export function getBusinessLogoHtml(business, size = 'medium') {
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.medium;

  if (business.logo && business.logo.startsWith('data:')) {
    return `<img src="${business.logo}" class="${sizeClass} rounded object-cover" alt="${escapeHtml(business.name || '')}">`;
  }
  return `<span class="${sizeClass} flex items-center justify-center text-lg">${business.emoji || '🏢'}</span>`;
}
