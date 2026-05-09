/**
 * Notifications — formatering for utskrift.
 *
 * Ekstrahert fra main.js. Ren funksjon: tar inn streng og returnerer
 * HTML-streng.
 */

import { escapeHtml } from '../../../shared/utils/helpers.js';

/**
 * Formater meldingsinnhold til HTML egnet for utskrift.
 *
 * @param {string} content
 * @returns {string}
 */
export function formatMessageForPrint(content) {
  if (!content) return '';

  // Escape HTML først
  let formatted = escapeHtml(content);

  // Konverter linjer med ═══ til separatorer
  formatted = formatted.replace(/═{3,}/g, '<div class="separator"></div>');

  // Konverter linjer med --- til separatorer
  formatted = formatted.replace(/-{3,}/g, '<div class="separator"></div>');

  // Uthev linjer som slutter med kolon (header-linjer)
  formatted = formatted.replace(/^(.+:)\s*$/gm, '<span class="header-line">$1</span>');

  return formatted;
}
