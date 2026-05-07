/**
 * Email Service
 * Håndterer e-postverifisering og passordgjenoppretting
 * Bruker Firebase Cloud Functions for å sende e-post via Gmail SMTP
 */

import { firebaseService } from '../shared/core/firebaseService.js';
import { hashPassword } from '../utils/helpers.js';

const COLLECTIONS = {
  EMAIL_VERIFICATIONS: 'emailVerifications',
  PASSWORD_RESETS: 'passwordResets'
};

// Firebase Cloud Functions URL
// Oppdateres automatisk etter deploy av functions
const FUNCTIONS_BASE_URL = 'https://us-central1-econsim-5723c.cloudfunctions.net';

class EmailService {
  constructor() {
    this.appUrl = window.location.origin;
    this.functionsUrl = FUNCTIONS_BASE_URL;
  }

  /**
   * Generer tilfeldig token
   */
  generateToken() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 32; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
  }

  /**
   * Generer tilfeldig passord (6 tegn)
   */
  generatePassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 6; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  /**
   * Opprett e-postverifisering
   * @param {string} userId - Bruker ID
   * @param {string} email - E-postadresse
   * @returns {Promise<Object>} - Verifikasjonsdata med token
   */
  async createEmailVerification(userId, email) {
    // Sørg for at Firebase er initialisert
    if (!firebaseService.isInitialized()) {
      await firebaseService.initialize();
    }

    const token = this.generateToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 timer

    const verification = {
      id: `verify-${Date.now()}`,
      userId,
      email: email.toLowerCase().trim(),
      token,
      verified: false,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString()
    };

    await firebaseService.set(COLLECTIONS.EMAIL_VERIFICATIONS, verification.id, verification);

    // Lag bekreftelseslenke
    const verifyUrl = `${this.appUrl}?verify=${token}`;

    return {
      token,
      verifyUrl,
      email: verification.email
    };
  }

  /**
   * Verifiser e-post med token
   * @param {string} token - Verifikasjonstoken
   * @returns {Promise<Object|null>} - Verifikasjonsdata eller null hvis ugyldig
   */
  async verifyEmail(token) {
    try {
      const verifications = await firebaseService.getAll(COLLECTIONS.EMAIL_VERIFICATIONS);
      const verification = verifications.find(v => v.token === token && !v.verified);

      if (!verification) {
        return { success: false, error: 'Ugyldig eller allerede brukt token' };
      }

      // Sjekk utløpsdato
      if (new Date(verification.expiresAt) < new Date()) {
        return { success: false, error: 'Token har utløpt' };
      }

      // Marker som verifisert
      await firebaseService.update(COLLECTIONS.EMAIL_VERIFICATIONS, verification.id, {
        verified: true,
        verifiedAt: new Date().toISOString()
      });

      return {
        success: true,
        userId: verification.userId,
        email: verification.email
      };
    } catch (error) {
      console.error('❌ Feil ved e-postverifisering:', error);
      return { success: false, error: 'Verifisering feilet' };
    }
  }

  /**
   * Sjekk om bruker har verifisert e-post
   * @param {string} userId - Bruker ID
   * @returns {Promise<Object|null>} - Verifisert e-post eller null
   */
  async getVerifiedEmail(userId) {
    try {
      const verifications = await firebaseService.getAll(COLLECTIONS.EMAIL_VERIFICATIONS);
      const verified = verifications.find(v => v.userId === userId && v.verified);
      return verified || null;
    } catch (error) {
      console.error('❌ Feil ved henting av verifisert e-post:', error);
      return null;
    }
  }

  /**
   * Hent ventende verifisering for bruker
   * @param {string} userId - Bruker ID
   * @returns {Promise<Object|null>} - Ventende verifisering eller null
   */
  async getPendingVerification(userId) {
    try {
      const verifications = await firebaseService.getAll(COLLECTIONS.EMAIL_VERIFICATIONS);
      const pending = verifications.find(v =>
        v.userId === userId &&
        !v.verified &&
        new Date(v.expiresAt) > new Date()
      );
      return pending || null;
    } catch (error) {
      console.error('❌ Feil ved henting av ventende verifisering:', error);
      return null;
    }
  }

  /**
   * Be om passordgjenoppretting
   * @param {string} email - E-postadresse
   * @returns {Promise<Object>} - Resultat med nytt passord hvis vellykket
   */
  async requestPasswordReset(email) {
    try {
      const normalizedEmail = email.toLowerCase().trim();

      // Finn verifisert e-post
      const verifications = await firebaseService.getAll(COLLECTIONS.EMAIL_VERIFICATIONS);
      const verification = verifications.find(v =>
        v.email === normalizedEmail && v.verified
      );

      if (!verification) {
        return {
          success: false,
          error: 'Ingen bruker med denne e-postadressen har bekreftet e-posten sin.'
        };
      }

      // Generer nytt passord
      const newPassword = this.generatePassword();
      const hashedPassword = await hashPassword(newPassword);

      // Lagre reset-request
      const resetRequest = {
        id: `reset-${Date.now()}`,
        userId: verification.userId,
        email: normalizedEmail,
        newPasswordHash: hashedPassword,
        newPasswordPlain: newPassword, // Lagres midlertidig for å vise til bruker
        createdAt: new Date().toISOString(),
        used: false
      };

      await firebaseService.set(COLLECTIONS.PASSWORD_RESETS, resetRequest.id, resetRequest);

      return {
        success: true,
        userId: verification.userId,
        newPassword,
        email: normalizedEmail,
        resetId: resetRequest.id
      };
    } catch (error) {
      console.error('❌ Feil ved passordgjenoppretting:', error);
      return { success: false, error: 'Passordgjenoppretting feilet' };
    }
  }

  /**
   * Bruk passord-reset (oppdater brukerens passord)
   * @param {string} resetId - Reset ID
   * @returns {Promise<boolean>} - Suksess
   */
  async usePasswordReset(resetId) {
    try {
      const reset = await firebaseService.get(COLLECTIONS.PASSWORD_RESETS, resetId);

      if (!reset || reset.used) {
        return false;
      }

      // Marker som brukt
      await firebaseService.update(COLLECTIONS.PASSWORD_RESETS, resetId, {
        used: true,
        usedAt: new Date().toISOString()
      });

      return true;
    } catch (error) {
      console.error('❌ Feil ved bruk av password reset:', error);
      return false;
    }
  }

  /**
   * Send e-post via Firebase Cloud Function
   * @param {string} to - Mottakers e-postadresse
   * @param {string} subject - E-postemne
   * @param {string} html - E-postinnhold (HTML)
   * @returns {Promise<boolean>} - Suksess
   */
  async sendEmail(to, subject, html) {
    console.log('📧 Forsøker å sende e-post til:', to);

    try {
      const response = await fetch(`${this.functionsUrl}/sendEmail`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ to, subject, html })
      });

      const result = await response.json();

      if (result.success) {
        console.log('✅ E-post sendt til:', to);
        return true;
      } else {
        console.error('❌ E-post feilet:', result.error);
        return false;
      }
    } catch (error) {
      console.error('❌ Feil ved sending av e-post:', error);
      return false;
    }
  }

  /**
   * Send e-postverifiseringslenke via Cloud Function
   * @param {string} email - Mottakers e-post
   * @param {string} verifyUrl - Verifiseringslenke
   * @returns {Promise<boolean>}
   */
  async sendVerificationEmail(email, verifyUrl) {
    console.log('📧 Sender verifiserings-e-post til:', email);

    try {
      const response = await fetch(`${this.functionsUrl}/sendVerificationEmail`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ to: email, verifyUrl })
      });

      const result = await response.json();

      if (result.success) {
        console.log('✅ Verifiserings-e-post sendt til:', email);
        return true;
      } else {
        console.error('❌ Verifiserings-e-post feilet:', result.error);
        return false;
      }
    } catch (error) {
      console.error('❌ Feil ved sending av verifiserings-e-post:', error);
      return false;
    }
  }

  /**
   * Send nytt passord via e-post via Cloud Function
   * @param {string} email - Mottakers e-post
   * @param {string} newPassword - Nytt passord
   * @returns {Promise<boolean>}
   */
  async sendPasswordResetEmail(email, newPassword) {
    console.log('📧 Sender passord-reset e-post til:', email);

    try {
      const response = await fetch(`${this.functionsUrl}/sendPasswordResetEmail`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to: email,
          newPassword,
          appUrl: this.appUrl
        })
      });

      const result = await response.json();

      if (result.success) {
        console.log('✅ Passord-reset e-post sendt til:', email);
        return true;
      } else {
        console.error('❌ Passord-reset e-post feilet:', result.error);
        return false;
      }
    } catch (error) {
      console.error('❌ Feil ved sending av passord-reset e-post:', error);
      return false;
    }
  }
}

// Eksporter singleton
export const emailService = new EmailService();
