/**
 * auth controllers — UI methods extracted from main.js (fase 5b).
 *
 * Slås sammen inn på EconSimApp.prototype via Object.assign i main.js.
 * `this`-semantikk preserveres slik at inline window.econSim.<method>()
 * fra index.html fortsatt virker.
 *
 * NB: importerer authService direkte fra services-mappen for å unngå
 * potensielle sirkulære importavhengigheter (auth/index.js → services →
 * controllers → auth/index.js).
 */

import { authService } from '../services/authService.js';
import { dataService } from '../../../shared/core/dataService.js';
import { uiManager } from '../../../shared/ui/uiManager.js';
import { settingsService } from '../../settings/index.js';
import { emailService } from '../../email/index.js';
import { languageService } from '../../i18n/index.js';
import { hashPassword, escapeHtml } from '../../../shared/utils/helpers.js';

export const authControllerMethods = {
  /**
   * Håndter login
   */
  async handleLogin() {
    const username = document.getElementById('username')?.value?.trim();
    const password = document.getElementById('password')?.value;
    const loginBtn = document.getElementById('loginBtn');
    const loginBtnText = document.getElementById('loginBtnText');
    const loginSpinner = document.getElementById('loginSpinner');
    const loginError = document.getElementById('loginError');
    const loginErrorText = document.getElementById('loginErrorText');

    console.log('🔐 handleLogin kalt med:', { username, passwordLength: password?.length });

    // Hide previous errors
    if (loginError) loginError.classList.add('hidden');

    // Show loading state
    if (loginBtn) loginBtn.disabled = true;
    if (loginBtnText) loginBtnText.textContent = languageService.t('ui.loggingIn');
    if (loginSpinner) loginSpinner.classList.remove('hidden');

    try {
      const user = await authService.login(username, password);
      console.log('✅ Logget inn som:', user.name, '- Type:', user.type);

      // Refresh alle tjeneste-cacher for riktig klasserom
      await this.refreshAllServiceCaches();

      // Refresh settings for riktig klasserom
      this.settings = await settingsService.getSettings();
      console.log('⚙️ Innstillinger lastet for klasserom:', this.settings.className);

      // Form cleares automatically on success
      document.getElementById('loginForm')?.reset();

      // Vis riktig dashboard basert på brukertype
      if (user.type === 'superadmin') {
        await this.showSuperadminDashboard();
      } else if (user.type === 'teacher') {
        await this.showTeacherDashboard();
      } else {
        await this.showStudentDashboard();
      }

      // Oppdater notification-badges ETTER at dashboard er vist
      // Dette sikrer at badges vises umiddelbart ved innlogging
      await this.updateAllBadges();
    } catch (error) {
      console.error('Login feilet:', error);

      // Show error message inline
      if (loginError && loginErrorText) {
        loginErrorText.textContent = error.message || languageService.t('error.wrongCredentials');
        loginError.classList.remove('hidden');
      } else {
        uiManager.showError(error.message || languageService.t('error.wrongCredentials'));
      }
    } finally {
      // Reset button state
      if (loginBtn) loginBtn.disabled = false;
      if (loginBtnText) loginBtnText.textContent = languageService.t('login.button');
      if (loginSpinner) loginSpinner.classList.add('hidden');
    }
  },

  /**
   * Håndter logout
   */
  handleLogout() {
    uiManager.confirm(languageService.t('confirm.logout'), () => {
      authService.logout();
      this.currentClassroom = null;

      // Refresh alle cacher for å unngå at data fra forrige bruker vises
      this.refreshAllServiceCaches();

      console.log('✅ Logget ut');

      // Vis login screen
      document.getElementById('loginScreen').classList.remove('hidden');
      document.getElementById('studentDashboard').classList.add('hidden');
      document.getElementById('teacherDashboard').classList.add('hidden');
      document.getElementById('superadminDashboard').classList.add('hidden');
    });
  },

  /**
   * Oppdater e-post verifikasjonsstatus i UI
   */
  async updateEmailVerificationStatus(user) {
    const notVerifiedEl = document.getElementById('emailNotVerified');
    const verifiedEl = document.getElementById('emailVerified');
    const pendingEl = document.getElementById('emailPending');
    const verifyBtn = document.getElementById('verifyEmailBtn');

    // Skjul alle først
    if (notVerifiedEl) notVerifiedEl.classList.add('hidden');
    if (verifiedEl) verifiedEl.classList.add('hidden');
    if (pendingEl) pendingEl.classList.add('hidden');

    if (!user) return;

    // Sjekk verifikasjonsstatus
    const verified = await emailService.getVerifiedEmail(user.id);
    const pending = await emailService.getPendingVerification(user.id);

    if (verified) {
      if (verifiedEl) verifiedEl.classList.remove('hidden');
      if (verifyBtn) {
        verifyBtn.textContent = 'Bekreftet ✓';
        verifyBtn.disabled = true;
        verifyBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
        verifyBtn.classList.add('bg-green-600', 'cursor-not-allowed');
      }
    } else if (pending) {
      if (pendingEl) pendingEl.classList.remove('hidden');
      if (verifyBtn) {
        verifyBtn.textContent = 'Send på nytt';
        verifyBtn.disabled = false;
      }
    } else {
      if (notVerifiedEl && user.email) notVerifiedEl.classList.remove('hidden');
      if (verifyBtn) {
        verifyBtn.textContent = 'Bekreft e-post';
        verifyBtn.disabled = false;
        verifyBtn.classList.remove('bg-green-600', 'cursor-not-allowed');
        verifyBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
      }
    }
  },

  /**
   * Send e-postbekreftelse
   */
  async sendEmailVerification() {
    const user = authService.getCurrentUser();
    if (!user) {
      uiManager.showError('Du må være logget inn');
      return;
    }

    const emailEl = document.getElementById('settingsTeacherEmail');
    const email = emailEl?.value?.trim();

    if (!email) {
      uiManager.showError('Skriv inn e-postadressen din først');
      return;
    }

    // Enkel e-postvalidering
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      uiManager.showError('Ugyldig e-postadresse');
      return;
    }

    try {
      // Lagre e-post på brukeren
      await dataService.updateUser(user.id, { email });
      await authService.refreshCurrentUser();

      // Opprett verifikasjon
      const result = await emailService.createEmailVerification(user.id, email);
      const verifyUrl = result.verifyUrl;

      // Send e-post via Cloud Function
      const emailSent = await emailService.sendVerificationEmail(email, verifyUrl);

      if (emailSent) {
        uiManager.showSuccess(languageService.t('email.verificationSent') || `Bekreftelseslenke sendt til ${email}!`);
      } else {
        // Fallback: Vis lenken direkte hvis e-post feiler
        uiManager.showInfo(languageService.t('email.verificationCreated') || 'Bekreftelseslenke opprettet');
        const message = `📧 E-post kunne ikke sendes.\n\nKlikk på lenken for å bekrefte:\n${verifyUrl}\n\nLenken er gyldig i 24 timer.`;
        alert(message);
      }

      // Oppdater status
      await this.updateEmailVerificationStatus(user);
    } catch (error) {
      console.error('Feil ved sending av bekreftelse:', error);
      uiManager.showError(languageService.t('error.couldNotSendVerification') || 'Kunne ikke sende bekreftelse. Prøv igjen.');
    }
  },

  /**
   * Vis glemt passord modal
   */
  showForgotPasswordModal() {
    const modal = document.getElementById('forgotPasswordModal');
    const resultEl = document.getElementById('forgotPasswordResult');
    const emailEl = document.getElementById('forgotPasswordEmail');

    if (modal) {
      modal.classList.remove('hidden');
    }
    if (resultEl) {
      resultEl.classList.add('hidden');
    }
    if (emailEl) {
      emailEl.value = '';
    }
  },

  /**
   * Be om passordgjenoppretting
   */
  async requestPasswordReset() {
    const emailEl = document.getElementById('forgotPasswordEmail');
    const resultEl = document.getElementById('forgotPasswordResult');
    const email = emailEl?.value?.trim();

    if (!email) {
      uiManager.showError('Skriv inn e-postadressen din');
      return;
    }

    // Enkel e-postvalidering
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      uiManager.showError('Ugyldig e-postadresse');
      return;
    }

    try {
      // Vis "sender..."-melding
      if (resultEl) {
        resultEl.innerHTML = `<p class="text-blue-600">📧 Sender e-post...</p>`;
        resultEl.classList.remove('hidden', 'bg-red-50', 'bg-green-50');
        resultEl.classList.add('bg-blue-50');
      }

      const result = await emailService.requestPasswordReset(email);

      if (!result.success) {
        if (resultEl) {
          resultEl.innerHTML = `<p class="text-red-600">❌ ${result.error}</p>`;
          resultEl.classList.remove('hidden', 'bg-blue-50');
          resultEl.classList.add('bg-red-50');
          resultEl.classList.remove('bg-green-50');
        }
        return;
      }

      // Oppdater brukerens passord i Firebase
      await dataService.updateUser(result.userId, {
        password: await hashPassword(result.newPassword)
      });

      // Send nytt passord via e-post
      const emailSent = await emailService.sendPasswordResetEmail(result.email, result.newPassword);

      // Marker reset som brukt
      await emailService.usePasswordReset(result.resetId);

      // Vis suksessmelding (uten å vise passordet)
      if (resultEl) {
        if (emailSent) {
          resultEl.innerHTML = `
            <div class="text-green-700">
              <p class="font-bold mb-2">✅ Nytt passord sendt!</p>
              <p class="mb-2">Et nytt passord er sendt til:</p>
              <p class="bg-white border-2 border-green-300 rounded p-3 font-medium text-center">${escapeHtml(result.email)}</p>
              <p class="text-sm mt-2">Sjekk innboksen din (og spam-mappen) og bruk det nye passordet for å logge inn.</p>
            </div>
          `;
        } else {
          // E-post feilet, men passord ble oppdatert
          resultEl.innerHTML = `
            <div class="text-yellow-700">
              <p class="font-bold mb-2">⚠️ Passord oppdatert, men e-post kunne ikke sendes</p>
              <p class="text-sm">Kontakt administrator for å få ditt nye passord.</p>
            </div>
          `;
          resultEl.classList.remove('bg-green-50');
          resultEl.classList.add('bg-yellow-50');
        }
        resultEl.classList.remove('hidden', 'bg-red-50', 'bg-blue-50');
        if (emailSent) resultEl.classList.add('bg-green-50');
      }
    } catch (error) {
      console.error('Feil ved passordgjenoppretting:', error);
      if (resultEl) {
        resultEl.innerHTML = `<p class="text-red-600">❌ Noe gikk galt. Prøv igjen.</p>`;
        resultEl.classList.remove('hidden', 'bg-blue-50');
        resultEl.classList.add('bg-red-50');
      }
    }
  },

  /**
   * Sjekk URL for e-postbekreftelsestoken
   */
  async checkEmailVerificationToken() {
    const urlParams = new URLSearchParams(window.location.search);
    const verifyToken = urlParams.get('verify');

    if (!verifyToken) return;

    try {
      const result = await emailService.verifyEmail(verifyToken);
      const modal = document.getElementById('emailVerifyModal');
      const successEl = document.getElementById('emailVerifySuccess');
      const errorEl = document.getElementById('emailVerifyError');

      if (result.success) {
        if (successEl) successEl.classList.remove('hidden');
        if (errorEl) errorEl.classList.add('hidden');
      } else {
        if (successEl) successEl.classList.add('hidden');
        if (errorEl) errorEl.classList.remove('hidden');
      }

      if (modal) modal.classList.remove('hidden');

      // Fjern token fra URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (error) {
      console.error('Feil ved e-postverifisering:', error);
    }
  },
};
