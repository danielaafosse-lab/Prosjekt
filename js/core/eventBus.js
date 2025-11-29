/**
 * EventBus - Simple pub/sub event system
 * Brukes for kommunikasjon mellom moduler uten tight coupling
 */

class EventBus {
  constructor() {
    this.events = {};
  }

  /**
   * Abonner på en event
   * @param {string} event - Event navn
   * @param {Function} callback - Callback funksjon
   * @returns {Function} Unsubscribe funksjon
   */
  on(event, callback) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(callback);
    
    // Returner unsubscribe funksjon
    return () => this.off(event, callback);
  }

  /**
   * Meld av en event
   * @param {string} event - Event navn
   * @param {Function} callback - Callback funksjon å fjerne
   */
  off(event, callback) {
    if (!this.events[event]) return;
    
    this.events[event] = this.events[event].filter(cb => cb !== callback);
  }

  /**
   * Emit en event
   * @param {string} event - Event navn
   * @param {*} data - Data å sende med event
   */
  emit(event, data) {
    if (!this.events[event]) return;
    
    this.events[event].forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event handler for "${event}":`, error);
      }
    });
  }

  /**
   * Lytt på en event bare én gang
   * @param {string} event - Event navn
   * @param {Function} callback - Callback funksjon
   */
  once(event, callback) {
    const onceCallback = (data) => {
      callback(data);
      this.off(event, onceCallback);
    };
    this.on(event, onceCallback);
  }
}

// Eksporter singleton instance
export const eventBus = new EventBus();

/**
 * Standard events brukt i applikasjonen
 */
export const EVENTS = {
  // Auth events
  USER_LOGGED_IN: 'user:loggedIn',
  USER_LOGGED_OUT: 'user:loggedOut',
  
  // Data events
  BALANCE_UPDATED: 'balance:updated',
  TRANSACTION_CREATED: 'transaction:created',
  JOB_CREATED: 'job:created',
  JOB_UPDATED: 'job:updated',
  JOB_DELETED: 'job:deleted',
  APPLICATION_CREATED: 'application:created',
  APPLICATION_UPDATED: 'application:updated',
  SETTINGS_UPDATED: 'settings:updated',
  USER_CREATED: 'user:created',
  USER_DELETED: 'user:deleted',
  
  // UI events
  SCREEN_CHANGED: 'screen:changed',
  NOTIFICATION: 'notification',
  ERROR: 'error'
};
