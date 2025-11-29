/**
 * UI Manager
 * Håndterer generell UI state, screen management og navigation
 */

import { authService } from '../core/auth.js';
import { eventBus, EVENTS } from '../core/eventBus.js';

class UIManager {
  constructor() {
    this.currentScreen = null;
    this.screens = {};
  }

  /**
   * Initialiser UI
   */
  init() {
    // Lytt på auth events
    eventBus.on(EVENTS.USER_LOGGED_IN, (user) => {
      if (user.type === 'teacher') {
        this.showScreen('teacherDashboard');
      } else {
        this.showScreen('studentDashboard');
      }
    });

    eventBus.on(EVENTS.USER_LOGGED_OUT, () => {
      this.showScreen('login');
    });

    // Lytt på errors
    eventBus.on(EVENTS.ERROR, (error) => {
      this.showError(error.message || 'En feil oppstod');
    });

    // Lytt på notifikasjoner
    eventBus.on(EVENTS.NOTIFICATION, (notification) => {
      this.showNotification(notification.message, notification.type || 'info');
    });
  }

  /**
   * Vis en screen
   * @param {string} screenId - Screen ID
   */
  showScreen(screenId) {
    // Skjul alle screens
    document.querySelectorAll('[data-screen]').forEach(screen => {
      screen.classList.add('hidden');
    });

    // Vis valgt screen
    const screen = document.querySelector(`[data-screen="${screenId}"]`);
    if (screen) {
      screen.classList.remove('hidden');
      this.currentScreen = screenId;
      eventBus.emit(EVENTS.SCREEN_CHANGED, screenId);
    } else {
      console.error(`Screen "${screenId}" ikke funnet`);
    }
  }

  /**
   * Få nåværende screen
   * @returns {string|null}
   */
  getCurrentScreen() {
    return this.currentScreen;
  }

  /**
   * Vis feilmelding
   * @param {string} message - Feilmelding
   * @param {number} duration - Varighet i ms (0 = ingen auto-hide)
   */
  showError(message, duration = 5000) {
    this.showNotification(message, 'error', duration);
  }

  /**
   * Vis suksessmelding
   * @param {string} message - Melding
   * @param {number} duration - Varighet i ms
   */
  showSuccess(message, duration = 3000) {
    this.showNotification(message, 'success', duration);
  }

  /**
   * Vis info-melding
   * @param {string} message - Melding
   * @param {number} duration - Varighet i ms
   */
  showInfo(message, duration = 3000) {
    this.showNotification(message, 'info', duration);
  }

  /**
   * Vis notifikasjon
   * @param {string} message - Melding
   * @param {string} type - Type: error, success, info, warning
   * @param {number} duration - Varighet i ms (0 = ingen auto-hide)
   */
  showNotification(message, type = 'info', duration = 3000) {
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 max-w-sm p-4 rounded-lg shadow-lg z-50 transform transition-all duration-300 ${this.getNotificationClass(type)}`;
    notification.innerHTML = `
      <div class="flex items-start">
        <div class="flex-shrink-0">
          ${this.getNotificationIcon(type)}
        </div>
        <div class="ml-3 flex-1">
          <p class="text-sm font-medium">${this.escapeHtml(message)}</p>
        </div>
        <button class="ml-4 inline-flex text-gray-400 hover:text-gray-500 focus:outline-none" onclick="this.closest('.fixed').remove()">
          <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
          </svg>
        </button>
      </div>
    `;

    document.body.appendChild(notification);

    // Slide in animation
    requestAnimationFrame(() => {
      notification.style.transform = 'translateX(0)';
    });

    // Auto remove
    if (duration > 0) {
      setTimeout(() => {
        notification.style.transform = 'translateX(400px)';
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
      }, duration);
    }
  }

  /**
   * Få CSS klasse for notifikasjonstype
   */
  getNotificationClass(type) {
    const classes = {
      error: 'bg-red-50 text-red-800 border-l-4 border-red-500',
      success: 'bg-green-50 text-green-800 border-l-4 border-green-500',
      warning: 'bg-yellow-50 text-yellow-800 border-l-4 border-yellow-500',
      info: 'bg-blue-50 text-blue-800 border-l-4 border-blue-500'
    };
    return classes[type] || classes.info;
  }

  /**
   * Få ikon for notifikasjonstype
   */
  getNotificationIcon(type) {
    const icons = {
      error: '<svg class="h-5 w-5 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>',
      success: '<svg class="h-5 w-5 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>',
      warning: '<svg class="h-5 w-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>',
      info: '<svg class="h-5 w-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>'
    };
    return icons[type] || icons.info;
  }

  /**
   * Vis modal
   * @param {string} title - Modal tittel
   * @param {string} content - Modal innhold (HTML)
   * @param {Array} buttons - Array av { text, onClick, class }
   */
  showModal(title, content, buttons = []) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50';
    
    const buttonsHtml = buttons.map((btn, i) => `
      <button data-modal-btn="${i}" class="${btn.class || 'bg-gray-200 hover:bg-gray-300'} px-4 py-2 rounded-md text-sm font-medium transition duration-200">
        ${this.escapeHtml(btn.text)}
      </button>
    `).join('');

    modal.innerHTML = `
      <div class="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h3 class="text-lg font-semibold mb-4">${this.escapeHtml(title)}</h3>
        <div class="mb-6">${content}</div>
        <div class="flex justify-end space-x-3">
          ${buttonsHtml}
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Add button event listeners
    buttons.forEach((btn, i) => {
      const btnElement = modal.querySelector(`[data-modal-btn="${i}"]`);
      if (btnElement && btn.onClick) {
        btnElement.addEventListener('click', () => {
          btn.onClick();
          modal.remove();
        });
      }
    });

    return modal;
  }

  /**
   * Vis confirm dialog
   * @param {string} message - Melding
   * @param {Function} onConfirm - Callback ved confirm
   * @param {Function} onCancel - Callback ved cancel
   */
  confirm(message, onConfirm, onCancel = null) {
    return this.showModal('Bekreft', `<p>${this.escapeHtml(message)}</p>`, [
      {
        text: 'Avbryt',
        onClick: onCancel || (() => {}),
        class: 'bg-gray-200 hover:bg-gray-300'
      },
      {
        text: 'Bekreft',
        onClick: onConfirm,
        class: 'bg-blue-600 hover:bg-blue-700 text-white'
      }
    ]);
  }

  /**
   * Vis loading spinner
   * @param {string} message - Melding
   * @returns {Object} - Loading element (kan fjernes senere)
   */
  showLoading(message = 'Laster...') {
    const loading = document.createElement('div');
    loading.className = 'fixed inset-0 bg-gray-500 bg-opacity-50 flex items-center justify-center z-50';
    loading.innerHTML = `
      <div class="bg-white rounded-lg shadow-xl p-6 text-center">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p class="text-gray-700">${this.escapeHtml(message)}</p>
      </div>
    `;

    document.body.appendChild(loading);
    return loading;
  }

  /**
   * Escape HTML for å forhindre XSS
   */
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Formater element-ID
   */
  $(selector) {
    return document.querySelector(selector);
  }

  /**
   * Formater element-ID (alle)
   */
  $$(selector) {
    return document.querySelectorAll(selector);
  }
}

// Eksporter singleton instance
export const uiManager = new UIManager();
