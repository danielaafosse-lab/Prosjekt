/**
 * notifications controllers — UI methods extracted from main.js (fase 5b).
 *
 * Slås sammen inn på EconSimApp.prototype via Object.assign i main.js.
 * `this`-semantikk preserveres slik at inline window.econSim.<method>()
 * fra index.html fortsatt virker.
 */

import { dataService } from '../../../shared/core/dataService.js';
import { authService } from '../../auth/index.js';
import { uiManager } from '../../../shared/ui/uiManager.js';
import { languageService } from '../../i18n/index.js';
import { classroomService } from '../../classroom/index.js';
import { businessService } from '../../businesses/index.js';
import { formatMessageForPrint } from '../index.js';
import { formatDate, formatRelativeTime } from '../../../shared/utils/formatters.js';
import { escapeHtml } from '../../../shared/utils/helpers.js';

export const notificationsControllerMethods = {
  /**
   * Start polling for badge-oppdateringer
   */
  async startBadgePolling() {
    // Oppdater badges umiddelbart
    await this.updateAllBadges();

    // Poll hvert 30. sekund (redusert fra 5s for å spare server-ressurser)
    this.badgePollingInterval = setInterval(async () => {
      await this.updateAllBadges();
    }, 30000);
  },

  /**
   * Oppdater alle badges
   */
  async updateAllBadges() {
    const user = authService.getCurrentUser();
    if (!user) return;

    if (user.role === 'student') {
      await this.updateInboxBadge();
      await this.updateJobsBadge();
    } else if (user.role === 'teacher') {
      await this.updateTeacherMessagesBadge();
    }

    // Oppdater bedriftsmeldinger-badge hvis relevant
    if (this.selectedBusinessId) {
      await this.updateBusinessMessagesBadge(this.selectedBusinessId);
    }
  },

  /**
   * Last studentens innboks med nye kategorier
   */
  async loadStudentInbox() {
    const user = authService.getCurrentUser();
    if (!user) return;

    const inbox = await dataService.getInbox(user.id);
    const outbox = await dataService.getOutbox(user.id);

    // Oppdater badge
    this.updateInboxBadge();

    // Kategoriser meldinger i 5 kategorier:
    // System: kontrakter, rapporter, varsler (automatiske systemgenererte meldinger)
    const systemTypes = ['system', 'tax_statement', 'contract', 'system_alert', 'salary', 'fine',
      'ownership_contract', 'loan_approved', 'loan_rejected', 'loan_paid_off', 'loan_contract',
      'employment_contract', 'weekly_report', 'interest'];

    const systemMessages = inbox.filter(m =>
      systemTypes.includes(m.type) || m.fromType === 'system'
    );

    // Lærer: meldinger fra lærer
    const teacherMessages = inbox.filter(m =>
      m.fromType === 'teacher' && !systemTypes.includes(m.type)
    );

    // Bedrifter: meldinger fra bedrifter
    const businessMessages = inbox.filter(m =>
      m.fromType === 'business' && !systemTypes.includes(m.type)
    );

    // Elever: meldinger fra andre elever
    const studentMessages = inbox.filter(m =>
      m.fromType === 'student' && !systemTypes.includes(m.type)
    );

    // Oppdater kategori-badges
    this.updateCategoryBadge('System', systemMessages);
    this.updateCategoryBadge('Teacher', teacherMessages);
    this.updateCategoryBadge('Businesses', businessMessages);
    this.updateCategoryBadge('Students', studentMessages);

    // Vis meldinger i hver kategori
    this.renderInboxCategory('System', systemMessages, 'systemmeldinger');
    this.renderInboxCategory('Teacher', teacherMessages, 'meldinger fra lærer');
    this.renderInboxCategory('Businesses', businessMessages, 'meldinger fra bedrifter');
    this.renderInboxCategory('Students', studentMessages, 'meldinger fra medelever');

    // Render utboks
    this.renderOutboxCategory('Outbox', outbox, 'sendte meldinger');

    // Last inn mottakerliste for å sende meldinger
    this.loadMessageRecipients();
  },

  /**
   * Oppdater badge for en kategori
   */
  updateCategoryBadge(category, messages) {
    const unreadCount = messages.filter(m => !m.read).length;
    const badge = document.getElementById(`inboxBadge${category}`);
    if (badge) {
      if (unreadCount > 0) {
        badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
  },

  /**
   * Render meldinger i en kategori
   */
  renderInboxCategory(category, messages, emptyText) {
    const container = document.getElementById(`inboxCategory${category}`);
    if (!container) return;

    if (messages.length === 0) {
      container.innerHTML = `<p class="text-gray-500 text-sm">${languageService.t('inbox.noMessagesPrefix')} ${emptyText}</p>`;
      return;
    }

    // Sorter etter dato, nyeste først
    messages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    container.innerHTML = messages.map(msg => {
      const isSystem = category === 'System';
      const bgClass = msg.read ? 'bg-gray-50 border-gray-200' : (isSystem ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200');
      const textClass = msg.read ? 'text-gray-700' : (isSystem ? 'text-green-800' : 'text-blue-800');

      let fromLabel = '';
      if (msg.fromName) {
        fromLabel = `<span class="text-xs text-gray-500">${languageService.t('common.from')}: ${escapeHtml(msg.fromName)}</span>`;
      }

      // Forkortet melding for visning
      const shortMessage = msg.message.length > 100 ? msg.message.substring(0, 100) + '...' : msg.message;

      return `
        <div class="p-4 rounded-lg border ${bgClass} cursor-pointer hover:shadow-md transition-shadow" onclick="window.econSim.openMessage('${msg.id}')">
          <div class="flex justify-between items-start mb-2">
            <div>
              <h4 class="font-medium ${textClass}">${escapeHtml(msg.title)}</h4>
              ${fromLabel}
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs text-gray-500">${formatRelativeTime(new Date(msg.createdAt))}</span>
              <button onclick="event.stopPropagation(); window.econSim.deleteMessage('${msg.id}')" class="text-red-400 hover:text-red-600" title="Slett">🗑️</button>
            </div>
          </div>
          <p class="text-sm text-gray-600 line-clamp-2">${escapeHtml(shortMessage)}</p>
          ${!msg.read ? '<span class="inline-block mt-2 text-xs text-blue-600">● Ulest</span>' : ''}
        </div>
      `;
    }).join('');
  },

  /**
   * Vis en innboks-kategori (elev)
   */
  showInboxCategory(category) {
    const categories = ['System', 'Teacher', 'Businesses', 'Students', 'Outbox'];
    const categoryMap = {
      'system': 'System',
      'teacher': 'Teacher',
      'businesses': 'Businesses',
      'students': 'Students',
      'outbox': 'Outbox'
    };
    const cat = categoryMap[category] || category;

    categories.forEach(c => {
      const container = document.getElementById(`inboxCategory${c}`);
      const tab = document.getElementById(`inboxTab${c}`);
      if (container && tab) {
        if (c === cat) {
          container.classList.remove('hidden');
          tab.classList.add('border-b-2', 'border-blue-500', 'text-blue-600');
          tab.classList.remove('text-gray-500');
        } else {
          container.classList.add('hidden');
          tab.classList.remove('border-b-2', 'border-blue-500', 'text-blue-600');
          tab.classList.add('text-gray-500');
        }
      }
    });
  },

  /**
   * Render utboks (sendte meldinger) med lest-status
   */
  renderOutboxCategory(category, messages, emptyText) {
    const container = document.getElementById(`inboxCategory${category}`);
    if (!container) return;

    if (!messages || messages.length === 0) {
      container.innerHTML = `<p class="text-gray-500 text-sm">Ingen ${emptyText}</p>`;
      return;
    }

    // Sorter etter dato, nyeste først
    messages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    container.innerHTML = messages.map(msg => {
      const readStatus = msg.recipientRead
        ? `<span class="text-green-500" title="Lest ${msg.recipientReadAt ? new Date(msg.recipientReadAt).toLocaleDateString('nb-NO') : ''}">✓ Lest</span>`
        : `<span class="text-gray-400" title="Ikke lest ennå">◯ Ulest</span>`;

      return `
        <div class="p-3 rounded-lg border bg-gray-50 border-gray-200">
          <div class="flex justify-between items-start mb-1">
            <div>
              <span class="font-medium text-sm text-gray-700">${escapeHtml(msg.title)}</span>
              <span class="text-xs text-gray-500 block">Til: ${escapeHtml(msg.recipientName || 'Ukjent')}</span>
            </div>
            <div class="flex items-center gap-2">
              ${readStatus}
              <span class="text-xs text-gray-500">${formatRelativeTime(new Date(msg.createdAt))}</span>
            </div>
          </div>
          <p class="text-sm text-gray-600 line-clamp-2">${escapeHtml(msg.message?.substring(0, 100) || '')}${msg.message?.length > 100 ? '...' : ''}</p>
        </div>
      `;
    }).join('');
  },

  /**
   * Last inn mottakerliste for å sende meldinger
   */
  async loadMessageRecipients() {
    const user = authService.getCurrentUser();
    if (!user) return;

    // Hent classroomId og classroom korrekt
    const classroomId = await dataService.getCurrentClassroomId();
    if (!classroomId) return;

    const classroom = classroomService.getClassroomById(classroomId);
    if (!classroom) return;

    // Hent alle brukere i DETTE klasserommet
    const classroomUsers = classroomService.getUsers().filter(u => u.classroomId === classroomId);

    // Lærer - finn læreren via classroom.teacherId
    const teacherGroup = document.getElementById('teacherRecipientGroup');
    if (teacherGroup) {
      teacherGroup.label = `📚 ${languageService.t('role.teacher')}`;
      const teacher = dataService.getUserById(classroom.teacherId);
      if (teacher) {
        teacherGroup.innerHTML = `<option value="teacher:${teacher.id}">👩‍🏫 ${escapeHtml(teacher.name || teacher.username)}</option>`;
      } else {
        teacherGroup.innerHTML = `<option disabled>${languageService.t('inbox.noTeacher')}</option>`;
      }
    }

    // Medelever (kun elever i samme klasserom, ikke meg selv)
    const studentGroup = document.getElementById('studentRecipientGroup');
    if (studentGroup) {
      studentGroup.label = `👥 ${languageService.t('inbox.classmates')}`;
      const students = classroomUsers.filter(u => (u.type === 'student' || u.role === 'student') && u.id !== user.id);
      if (students.length > 0) {
        studentGroup.innerHTML = students.map(s =>
          `<option value="student:${s.id}">👤 ${escapeHtml(s.name || s.username)}</option>`
        ).join('');
      } else {
        studentGroup.innerHTML = `<option disabled>${languageService.t('inbox.noClassmates')}</option>`;
      }
    }

    // Bedrifter (kun bedrifter i dette klasserommet - hentes fra businessService)
    const businessGroup = document.getElementById('businessRecipientGroup');
    if (businessGroup) {
      businessGroup.label = `🏢 ${languageService.t('common.businesses')}`;
      const businesses = businessService.getBusinessesByClassroom(classroomId).filter(b => b.isActive !== false);
      if (businesses.length > 0) {
        businessGroup.innerHTML = businesses.map(b =>
          `<option value="business:${b.id}">🏢 ${escapeHtml(b.name)}</option>`
        ).join('');
      } else {
        businessGroup.innerHTML = `<option disabled>${languageService.t('inbox.noBusinesses')}</option>`;
      }
    }
  },

  /**
   * Send melding fra elev — funksjonaliteten er fjernet.
   * Elever får bare varsler nå (system-meldinger fra banken og lærer-
   * kunngjøringer); peer-to-peer-meldinger ble fjernet i en tidligere
   * versjon. Metoden beholdes som no-op for å unngå at gammel HTML
   * eller event-binding kaster feil hvis den fortsatt refererer hit.
   */
  async sendStudentMessage() {
    return;
  },

  /**
   * Slett en melding
   */
  async deleteMessage(messageId) {
    const user = authService.getCurrentUser();
    if (!user) return;

    if (!confirm(languageService.t('confirm.deleteMessage'))) return;

    try {
      await dataService.deleteMessage(messageId, 'inbox');
      // Slett også utboks-kopien hvis den finnes
      await dataService.deleteOutboxForMessage(messageId);
      uiManager.showSuccess(languageService.t('msg.messageDeleted'));
    } catch (e) {
      console.error('Firebase feilet ved sletting av melding:', e);
      uiManager.showError('Kunne ikke slette meldingen. Prøv igjen.');
    }

    await this.loadStudentInbox();
  },

  /**
   * Oppdater innboks-badge
   */
  async updateInboxBadge() {
    const user = authService.getCurrentUser();
    if (!user) return;

    const inbox = await dataService.getInbox(user.id);
    const unreadCount = inbox.filter(m => !m.read).length;

    const badge = document.getElementById('inboxBadge');
    if (badge) {
      if (unreadCount > 0) {
        badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
  },

  /**
   * Åpne melding i modal for lesing
   */
  async openMessage(messageId) {
    const user = authService.getCurrentUser();
    if (!user) return;

    const inbox = await dataService.getInbox(user.id);

    const msg = inbox.find(m => m.id === messageId);
    if (!msg) return;

    // Marker som lest
    if (!msg.read) {
      try {
        await dataService.markMessageAsRead(messageId, 'inbox');
        await this.loadStudentInbox();
        await this.updateInboxBadge();
      } catch (e) {
        console.error('Firebase feilet ved markering av melding som lest:', e);
      }
    }

    // Vis i modal
    document.getElementById('messageViewTitle').textContent = msg.title;
    document.getElementById('messageViewFrom').textContent = msg.fromName ? `${languageService.t('common.from')}: ${msg.fromName}` : '';
    document.getElementById('messageViewDate').textContent = `${languageService.t('common.date')}: ${new Date(msg.createdAt).toLocaleDateString('nb-NO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })}`;
    document.getElementById('messageViewContent').textContent = msg.message;

    // Lagre melding-info for svar og print (støtter både fromId/senderId varianter)
    this.currentMessageId = messageId;
    const msgSenderId = msg.fromId || msg.senderId;
    const msgSenderType = msg.fromType || msg.senderType;
    const msgSenderName = msg.fromName || msg.senderName;

    this.currentReplyContext = {
      type: 'student',
      originalMessage: msg,
      senderId: msgSenderId,
      senderType: msgSenderType,
      senderName: msgSenderName
    };

    // Vis/skjul svar-knapp basert på meldingstype
    // Automatiske meldinger (kontrakter, systemvarsler) skal ikke ha svar-knapp
    const noReplyTypes = ['system', 'system_alert', 'contract', 'loan_contract', 'employment_contract',
      'ownership_contract', 'tax_statement', 'salary', 'fine', 'loan_approved', 'loan_rejected', 'loan_paid_off'];
    const replyBtn = document.getElementById('messageReplyBtn');
    if (replyBtn) {
      if (msgSenderId && msgSenderType && !noReplyTypes.includes(msg.type)) {
        replyBtn.classList.remove('hidden');
      } else {
        replyBtn.classList.add('hidden');
      }
    }

    document.getElementById('messageViewModal').classList.remove('hidden');
  },

  /**
   * Svar på melding
   */
  replyToMessage() {
    const ctx = this.currentReplyContext;
    if (!ctx || !ctx.originalMessage) {
      uiManager.showError(languageService.t('error.cannotReply'));
      return;
    }

    const user = authService.getCurrentUser();
    if (!user) return;

    const origMsg = ctx.originalMessage;
    const origDate = new Date(origMsg.createdAt).toLocaleDateString('nb-NO', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    // Bygg svar-tittel med "Re:" prefiks
    let replyTitle = origMsg.title || '';
    if (!replyTitle.toLowerCase().startsWith('re:')) {
      replyTitle = `${languageService.t('inbox.replyPrefix')} ${replyTitle}`;
    }

    // Bygg original melding-sitat
    const quotedMessage = `\n\n${languageService.t('inbox.originalMessage')}\n${languageService.t('inbox.from')}: ${ctx.senderName || languageService.t('common.unknown')}\n${languageService.t('inbox.date')}: ${origDate}\n\n${origMsg.message}`;

    // Lukk meldingsvisning
    document.getElementById('messageViewModal').classList.add('hidden');

    // Åpne riktig svar-grensesnitt basert på kontekst
    if (ctx.type === 'student') {
      // Elev svarer - åpne student innboks-tab med forhåndsutfylt data
      this.openStudentReplyForm(ctx, replyTitle, quotedMessage);
    } else if (ctx.type === 'business') {
      // Bedrift svarer
      this.openBusinessReplyForm(ctx, replyTitle, quotedMessage);
    } else if (ctx.type === 'teacher') {
      // Lærer svarer
      this.openTeacherReplyForm(ctx, replyTitle, quotedMessage);
    }
  },

  /**
   * Åpne svarskjema for elev
   */
  openStudentReplyForm(ctx, replyTitle, quotedMessage) {
    // Forhåndsutfyll felter
    const recipientSelect = document.getElementById('studentMessageRecipient');
    const subjectInput = document.getElementById('studentMessageSubject');
    const bodyInput = document.getElementById('studentMessageBody');

    if (recipientSelect) {
      // Sett mottaker basert på avsendertype
      const recipientValue = `${ctx.senderType}:${ctx.senderId}`;
      recipientSelect.value = recipientValue;
    }

    if (subjectInput) subjectInput.value = replyTitle;
    if (bodyInput) {
      bodyInput.value = quotedMessage;
      // Sett fokus øverst i tekstfeltet
      bodyInput.focus();
      bodyInput.setSelectionRange(0, 0);
    }

    // Scroll til skriv melding-seksjonen
    const sendSection = document.getElementById('studentMessageRecipient')?.closest('.bg-white');
    if (sendSection) sendSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  /**
   * Åpne svarskjema for bedrift
   */
  openBusinessReplyForm(ctx, replyTitle, quotedMessage) {
    // Sørg for at innboks-tab er synlig
    this.showBusinessTab('inbox');

    // Forhåndsutfyll felter
    const recipientSelect = document.getElementById('businessMessageRecipient');
    const subjectInput = document.getElementById('businessMessageSubject');
    const bodyInput = document.getElementById('businessMessageBody');

    if (recipientSelect) {
      // Sett mottaker basert på avsendertype (teacher_, student_, employee_, business_)
      let recipientValue = '';
      if (ctx.senderType === 'teacher') {
        recipientValue = `teacher_${ctx.senderId}`;
      } else if (ctx.senderType === 'student') {
        recipientValue = `student_${ctx.senderId}`;
      } else if (ctx.senderType === 'business') {
        recipientValue = `business_${ctx.senderId}`;
      }
      recipientSelect.value = recipientValue;
    }

    if (subjectInput) subjectInput.value = replyTitle;
    if (bodyInput) {
      bodyInput.value = quotedMessage;
      bodyInput.focus();
      bodyInput.setSelectionRange(0, 0);
    }
  },

  /**
   * Åpne svarskjema for lærer
   */
  openTeacherReplyForm(ctx, replyTitle, quotedMessage) {
    // Forhåndsutfyll felter
    const recipientSelect = document.getElementById('teacherMessageRecipient');
    const subjectInput = document.getElementById('teacherMessageSubject');
    const bodyInput = document.getElementById('teacherMessageBody');

    if (recipientSelect) {
      // Sett mottaker basert på avsendertype
      let recipientValue = '';
      if (ctx.senderType === 'student') {
        recipientValue = `student:${ctx.senderId}`;
      } else if (ctx.senderType === 'business') {
        recipientValue = `business:${ctx.senderId}`;
      }
      recipientSelect.value = recipientValue;
    }

    if (subjectInput) subjectInput.value = replyTitle;
    if (bodyInput) {
      bodyInput.value = quotedMessage;
      bodyInput.focus();
      bodyInput.setSelectionRange(0, 0);
    }

    // Scroll til skriv melding-seksjonen
    const sendSection = document.getElementById('teacherMessageForm');
    if (sendSection) sendSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  /**
   * Skriv ut melding med forbedret formatering
   */
  printMessage() {
    const title = document.getElementById('messageViewTitle').textContent;
    const from = document.getElementById('messageViewFrom').textContent;
    const date = document.getElementById('messageViewDate').textContent;
    const content = document.getElementById('messageViewContent').textContent;

    // Konverter innhold til HTML-format (bevar linjeskift)
    const formattedContent = formatMessageForPrint(content);

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${escapeHtml(title)}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: 'Segoe UI', Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 30px;
            line-height: 1.5;
            color: #333;
          }
          h1 {
            font-size: 22px;
            margin-bottom: 8px;
            color: #1a1a1a;
            border-bottom: 2px solid #3b82f6;
            padding-bottom: 8px;
          }
          .meta {
            color: #666;
            font-size: 13px;
            margin-bottom: 24px;
          }
          .meta p { margin: 4px 0; }
          .content {
            white-space: pre-wrap;
            word-wrap: break-word;
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            border: 1px solid #e5e7eb;
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 12px;
            line-height: 1.6;
          }
          .content .separator {
            border-top: 1px dashed #ccc;
            margin: 16px 0;
          }
          .content .header-line {
            font-weight: bold;
            color: #1a1a1a;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 16px 0;
          }
          th, td {
            border: 1px solid #d1d5db;
            padding: 8px 12px;
            text-align: left;
            font-size: 11px;
          }
          th {
            background: #f3f4f6;
            font-weight: 600;
          }
          tr:nth-child(even) { background: #f9fafb; }
          @media print {
            body { margin: 0; padding: 20px; }
            .content { background: white; border: 1px solid #ccc; }
          }
          .logo {
            text-align: center;
            margin-bottom: 20px;
            font-size: 24px;
          }
          .footer {
            margin-top: 30px;
            text-align: center;
            font-size: 11px;
            color: #888;
            border-top: 1px solid #e5e7eb;
            padding-top: 16px;
          }
        </style>
      </head>
      <body>
        <div class="logo">🏦 EconSim</div>
        <h1>${escapeHtml(title)}</h1>
        <div class="meta">
          <p>${escapeHtml(from)}</p>
          <p>${escapeHtml(date)}</p>
        </div>
        <div class="content">${formattedContent}</div>
        <div class="footer">
          Skrevet ut fra EconSim - ${new Date().toLocaleDateString('nb-NO')}
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  },

  /**
   * Marker melding som lest
   */
  async markMessageAsRead(messageId) {
    const user = authService.getCurrentUser();
    if (!user) return;

    try {
      await dataService.markMessageAsRead(messageId, 'inbox');
      await this.loadStudentInbox();
      await this.updateInboxBadge();
    } catch (e) {
      console.error('Firebase feilet ved markering av melding som lest:', e);
    }
  },

  /**
   * Marker alle meldinger som lest
   */
  async markAllAsRead() {
    const user = authService.getCurrentUser();
    if (!user) return;

    const inbox = await dataService.getInbox(user.id);

    try {
      for (const m of inbox) {
        if (!m.read) {
          await dataService.markMessageAsRead(m.id, 'inbox');
        }
      }
    } catch (e) {
      console.error('Firebase feilet ved markering av alle meldinger som lest:', e);
    }

    await this.loadStudentInbox();
    await this.updateInboxBadge();
    uiManager.showSuccess(languageService.t('msg.allMessagesRead'));
  },

  /**
   * Last meldinger for lærer med nye kategorier
   */
  async loadTeacherMessages() {
    const user = authService.getCurrentUser();
    if (!user) return;

    const recipientSelect = document.getElementById('teacherMessageRecipient');

    // Last meldinger fra Firebase (for lærer)
    const messages = await dataService.getTeacherMessages();
    const outbox = await dataService.getOutbox(user.id);

    // Oppdater badge
    await this.updateTeacherMessagesBadge();

    // Kategoriser meldinger i 6 kategorier:
    // System: ukesrapporter, økonomioversikt, varsler
    const systemTypes = ['economy_report', 'weekly_report', 'system_alert'];
    const systemMessages = messages.filter(m => systemTypes.includes(m.type));

    // Lån: lånekontrakter, nedbetalingsplaner
    const loanTypes = ['loan_contract', 'loan_payment_failed', 'loan_completed', 'loan_warning', 'loan_approved', 'loan_rejected'];
    const loanMessages = messages.filter(m =>
      loanTypes.includes(m.type) || m.category === 'loans'
    );

    // Jobb: arbeidskontrakter
    const jobTypes = ['employment_contract', 'job_offer', 'job_accepted', 'job_completed', 'salary_failure', 'job_quit'];
    const jobMessages = messages.filter(m =>
      jobTypes.includes(m.type) || m.category === 'jobs'
    );

    // Bedrifter: meldinger fra bedrifter
    const businessMessages = messages.filter(m =>
      m.fromType === 'business' &&
      !loanTypes.includes(m.type) &&
      !jobTypes.includes(m.type) &&
      !systemTypes.includes(m.type)
    );

    // Elever: meldinger fra elever
    const studentMessages = messages.filter(m =>
      m.fromType === 'student' &&
      !loanTypes.includes(m.type) &&
      !jobTypes.includes(m.type) &&
      !systemTypes.includes(m.type)
    );

    // Oppdater kategori-badges
    this.updateTeacherCategoryBadge('System', systemMessages);
    this.updateTeacherCategoryBadge('Loans', loanMessages);
    this.updateTeacherCategoryBadge('Jobs', jobMessages);
    this.updateTeacherCategoryBadge('Businesses', businessMessages);
    this.updateTeacherCategoryBadge('Students', studentMessages);

    // Render kategoriene
    this.renderTeacherInboxCategory('System', systemMessages, 'systemmeldinger');
    this.renderTeacherInboxCategory('Loans', loanMessages, 'lånemeldinger');
    this.renderTeacherInboxCategory('Jobs', jobMessages, 'jobbmeldinger');
    this.renderTeacherInboxCategory('Businesses', businessMessages, 'meldinger fra bedrifter');
    this.renderTeacherInboxCategory('Students', studentMessages, 'meldinger fra elever');

    // Render utboks
    this.renderTeacherOutboxCategory('Outbox', outbox, 'sendte meldinger');

    // Fyll inn mottakere (elever i klasserommet + bedrifter)
    if (recipientSelect) {
      const classroom = classroomService.getClassroomByTeacher(user.id);
      const students = classroomService.getStudentsByClassroom(classroom?.id) || [];
      const businesses = classroom?.id ? businessService.getBusinessesByClassroom(classroom.id).filter(b => b.isActive !== false) : [];

      // Elever
      const studentGroup = document.getElementById('teacherStudentRecipientGroup');
      if (studentGroup) {
        studentGroup.label = `👤 ${languageService.t('common.students')}`;
        if (students.length > 0) {
          studentGroup.innerHTML = students.map(s =>
            `<option value="student:${s.id}">👤 ${escapeHtml(s.name)}</option>`
          ).join('');
        } else {
          studentGroup.innerHTML = `<option disabled>${languageService.t('inbox.noStudents')}</option>`;
        }
      }

      // Bedrifter
      const businessGroup = document.getElementById('teacherBusinessRecipientGroup');
      if (businessGroup) {
        businessGroup.label = `🏢 ${languageService.t('common.businesses')}`;
        if (businesses.length > 0) {
          businessGroup.innerHTML = businesses.map(b =>
            `<option value="business:${b.id}">${b.emoji || '🏢'} ${escapeHtml(b.name)}</option>`
          ).join('');
        } else {
          businessGroup.innerHTML = `<option disabled>${languageService.t('inbox.noBusinesses')}</option>`;
        }
      }
    }
  },

  /**
   * Oppdater badge for en lærerkategori
   */
  updateTeacherCategoryBadge(category, messages) {
    const unreadCount = messages.filter(m => !m.read).length;
    const badge = document.getElementById(`teacherInboxBadge${category}`);
    if (badge) {
      if (unreadCount > 0) {
        badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
  },

  /**
   * Render meldinger i en lærerkategori
   */
  renderTeacherInboxCategory(category, messages, emptyText) {
    const container = document.getElementById(`teacherInboxCategory${category}`);
    if (!container) return;

    if (messages.length === 0) {
      container.innerHTML = `<p class="text-gray-500 text-sm">${languageService.t('inbox.noMessagesPrefix')} ${emptyText}</p>`;
      return;
    }

    // Sorter etter dato, nyeste først
    const sortedMessages = [...messages].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    container.innerHTML = sortedMessages.map(msg => {
      const isSystem = category === 'System';
      const bgClass = msg.read ? 'bg-gray-50 border-gray-200' : (isSystem ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200');
      const textClass = msg.read ? 'text-gray-700' : (isSystem ? 'text-green-800' : 'text-blue-800');

      return `
        <div class="p-3 rounded-lg border ${bgClass} cursor-pointer hover:shadow-md transition-shadow" onclick="window.econSim.openTeacherMessage('${msg.id}')">
          <div class="flex justify-between items-start mb-1">
            <div>
              <span class="font-medium text-sm ${textClass}">${escapeHtml(msg.title || languageService.t('inbox.message'))}</span>
              ${msg.fromName ? `<span class="text-xs text-gray-500 block">${languageService.t('common.from')}: ${escapeHtml(msg.fromName)}</span>` : ''}
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs text-gray-500">${formatRelativeTime(new Date(msg.createdAt))}</span>
              <button onclick="event.stopPropagation(); window.econSim.deleteTeacherMessage('${msg.id}')" class="text-red-400 hover:text-red-600" title="${languageService.t('common.delete')}">🗑️</button>
            </div>
          </div>
          <p class="text-sm text-gray-600 line-clamp-2">${escapeHtml(msg.message)}</p>
          ${!msg.read ? `<span class="inline-block mt-1 text-xs text-blue-600">● ${languageService.t('inbox.unread')}</span>` : ''}
        </div>
      `;
    }).join('');
  },

  /**
   * Vis en lærerinnboks-kategori
   */
  showTeacherInboxCategory(category) {
    const categories = ['System', 'Loans', 'Jobs', 'Businesses', 'Students', 'Outbox'];
    const categoryMap = {
      'system': 'System',
      'loans': 'Loans',
      'jobs': 'Jobs',
      'businesses': 'Businesses',
      'students': 'Students',
      'outbox': 'Outbox'
    };
    const cat = categoryMap[category] || category;

    categories.forEach(c => {
      const container = document.getElementById(`teacherInboxCategory${c}`);
      const tab = document.getElementById(`teacherInboxTab${c}`);
      if (container && tab) {
        if (c === cat) {
          container.classList.remove('hidden');
          tab.classList.add('border-b-2', 'border-blue-500', 'text-blue-600');
          tab.classList.remove('text-gray-500');
        } else {
          container.classList.add('hidden');
          tab.classList.remove('border-b-2', 'border-blue-500', 'text-blue-600');
          tab.classList.add('text-gray-500');
        }
      }
    });
  },

  /**
   * Render utboks for lærer (sendte meldinger) med lest-status
   */
  renderTeacherOutboxCategory(category, messages, emptyText) {
    const container = document.getElementById(`teacherInboxCategory${category}`);
    if (!container) return;

    if (!messages || messages.length === 0) {
      container.innerHTML = `<p class="text-gray-500 text-sm">Ingen ${emptyText}</p>`;
      return;
    }

    // Sorter etter dato, nyeste først
    messages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    container.innerHTML = messages.map(msg => {
      const readStatus = msg.recipientRead
        ? `<span class="text-green-500" title="Lest ${msg.recipientReadAt ? new Date(msg.recipientReadAt).toLocaleDateString('nb-NO') : ''}">✓ Lest</span>`
        : `<span class="text-gray-400" title="Ikke lest ennå">◯ Ulest</span>`;

      return `
        <div class="p-3 rounded-lg border bg-gray-50 border-gray-200">
          <div class="flex justify-between items-start mb-1">
            <div>
              <span class="font-medium text-sm text-gray-700">${escapeHtml(msg.title)}</span>
              <span class="text-xs text-gray-500 block">Til: ${escapeHtml(msg.recipientName || 'Ukjent')}</span>
            </div>
            <div class="flex items-center gap-2">
              ${readStatus}
              <span class="text-xs text-gray-500">${formatRelativeTime(new Date(msg.createdAt))}</span>
            </div>
          </div>
          <p class="text-sm text-gray-600 line-clamp-2">${escapeHtml(msg.message?.substring(0, 100) || '')}${msg.message?.length > 100 ? '...' : ''}</p>
        </div>
      `;
    }).join('');
  },

  /**
   * Slett en lærermelding
   */
  async deleteTeacherMessage(messageId) {
    if (!confirm(languageService.t('confirm.deleteMessage'))) return;

    try {
      await dataService.deleteMessage(messageId, 'messages');
      // Slett også utboks-kopien hvis den finnes
      await dataService.deleteOutboxForMessage(messageId);
      uiManager.showSuccess(languageService.t('msg.messageDeleted'));
    } catch (e) {
      console.error('Firebase feilet ved sletting av lærermelding:', e);
      uiManager.showError('Kunne ikke slette meldingen. Prøv igjen.');
    }

    await this.loadTeacherMessages();
  },

  /**
   * Send melding fra lærer
   */
  async sendTeacherMessage(e) {
    e.preventDefault();

    const user = authService.getCurrentUser();
    if (!user) return;

    const recipientValue = document.getElementById('teacherMessageRecipient').value;
    const title = document.getElementById('teacherMessageTitle').value.trim();
    const messageText = document.getElementById('teacherMessageText').value.trim();

    if (!recipientValue) {
      uiManager.showError(languageService.t('error.noStudentSelected'));
      return;
    }

    if (!title) {
      uiManager.showError(languageService.t('error.writeTitle'));
      return;
    }

    if (!messageText) {
      uiManager.showError(languageService.t('error.writeMessage'));
      return;
    }

    const classroom = classroomService.getClassroomByTeacher(user.id);
    const senderName = `👨‍🏫 ${user.name} (${languageService.t('role.teacher')})`;

    const sendToStudent = async (recipient) => {
      await dataService.createInboxMessage({
        recipientId: recipient.id,
        title: title,
        message: messageText,
        fromName: senderName,
        fromId: user.id,
        fromType: 'teacher',
        type: 'teacher_announcement'
      });
    };

    const sendToBusiness = async (businessId) => {
      await dataService.createBusinessMessage({
        businessId,
        senderId: user.id,
        senderName,
        senderType: 'teacher',
        fromType: 'teacher',
        title,
        message: messageText,
        type: 'teacher_announcement'
      });
    };

    let studentRecipients = [];
    let businessRecipients = [];

    if (recipientValue === 'all_students_businesses' || recipientValue === 'all') {
      studentRecipients = classroomService.getStudentsByClassroom(classroom?.id) || [];
      businessRecipients = businessService.getAllBusinesses().filter(b => b.status === 'active').map(b => b.id);
    } else if (recipientValue === 'all_students') {
      studentRecipients = classroomService.getStudentsByClassroom(classroom?.id) || [];
    } else if (recipientValue === 'all_businesses') {
      businessRecipients = businessService.getAllBusinesses().filter(b => b.status === 'active').map(b => b.id);
    } else if (recipientValue.startsWith('student:')) {
      const studentId = recipientValue.split(':')[1];
      const student = dataService.getUserById(studentId);
      if (student) studentRecipients = [student];
    } else {
      const student = dataService.getUserById(recipientValue);
      if (student) studentRecipients = [student];
    }

    if (studentRecipients.length === 0 && businessRecipients.length === 0) {
      uiManager.showError(languageService.t('error.noRecipientsFound'));
      return;
    }

    for (const recipient of studentRecipients) {
      await sendToStudent(recipient).catch(e => console.error(`Feil sending til ${recipient.name}:`, e));
    }
    for (const bizId of businessRecipients) {
      await sendToBusiness(bizId).catch(e => console.error(`Feil sending til bedrift ${bizId}:`, e));
    }

    document.getElementById('teacherMessageForm').reset();

    const totalCount = studentRecipients.length + businessRecipients.length;
    const msg = totalCount === 1 && studentRecipients.length === 1
      ? `${languageService.t('msg.messageSentTo')} ${studentRecipients[0].name}`
      : `Kunngjøring sendt til ${totalCount} mottakere`;
    uiManager.showSuccess(msg);
  },

  /**
   * Åpne lærermelding i modal
   */
  async openTeacherMessage(messageId) {
    const messages = await dataService.getTeacherMessages();
    const message = messages.find(m => m.id === messageId);

    if (!message) {
      uiManager.showError(languageService.t('error.messageNotFound'));
      return;
    }

    // Marker som lest
    if (!message.read) {
      try {
        await dataService.markMessageAsRead(messageId, 'messages');
        await this.loadTeacherMessages();
      } catch (e) {
        console.error('Firebase feilet ved markering av lærermelding som lest:', e);
      }
    }

    // Vis modal
    const modal = document.getElementById('messageViewModal');
    const titleEl = document.getElementById('messageViewTitle');
    const fromEl = document.getElementById('messageViewFrom');
    const dateEl = document.getElementById('messageViewDate');
    const contentEl = document.getElementById('messageViewContent');

    if (modal && titleEl && contentEl) {
      titleEl.textContent = message.title || languageService.t('inbox.message');
      if (fromEl) fromEl.textContent = message.fromName ? `${languageService.t('common.from')}: ${message.fromName}` : '';
      if (dateEl) dateEl.textContent = `${languageService.t('common.date')}: ${formatDate(new Date(message.createdAt))}`;
      contentEl.innerHTML = escapeHtml(message.message).replace(/\n/g, '<br>');

      // Lagre melding-info for svar (støtter både fromId/senderId varianter)
      this.currentMessageId = messageId;
      const msgSenderId = message.fromId || message.senderId;
      const msgSenderType = message.fromType || message.senderType;
      const msgSenderName = message.fromName || message.senderName;

      this.currentReplyContext = {
        type: 'teacher',
        originalMessage: message,
        senderId: msgSenderId,
        senderType: msgSenderType,
        senderName: msgSenderName
      };

      // Vis/skjul svar-knapp basert på meldingstype
      const noReplyTypes = ['system', 'system_alert', 'economy_report', 'weekly_report',
        'loan_contract', 'loan_payment_failed', 'loan_completed', 'loan_warning', 'salary_failure'];
      const replyBtn = document.getElementById('messageReplyBtn');
      if (replyBtn) {
        if (msgSenderId && msgSenderType && !noReplyTypes.includes(message.type)) {
          replyBtn.classList.remove('hidden');
        } else {
          replyBtn.classList.add('hidden');
        }
      }

      modal.classList.remove('hidden');
    }
  },

  /**
   * Marker lærermelding som lest
   */
  async markTeacherMessageAsRead(messageId) {
    try {
      await dataService.markMessageAsRead(messageId, 'messages');
      await this.loadTeacherMessages();
    } catch (e) {
      console.error('Firebase feilet ved markering av lærermelding som lest:', e);
    }
  },

  /**
   * Marker alle lærermeldinger som lest
   */
  async markAllTeacherMessagesAsRead() {
    const messages = await dataService.getTeacherMessages();

    try {
      for (const m of messages) {
        if (!m.read) {
          await dataService.markMessageAsRead(m.id, 'messages');
        }
      }
    } catch (e) {
      console.error('Firebase feilet ved markering av alle lærermeldinger som lest:', e);
    }

    await this.loadTeacherMessages();
    uiManager.showSuccess(languageService.t('msg.allMessagesRead'));
  },

  /**
   * Oppdater badge for lærermeldinger
   */
  async updateTeacherMessagesBadge() {
    const badge = document.getElementById('teacherMessagesBadge');
    const badge2 = document.getElementById('teacherMessagesBadge2');

    const messages = await dataService.getTeacherMessages();
    const unreadCount = messages.filter(m => !m.read).length;

    // Oppdater begge badges
    [badge, badge2].forEach(b => {
      if (!b) return;
      if (unreadCount > 0) {
        b.textContent = unreadCount > 9 ? '9+' : unreadCount;
        b.classList.remove('hidden');
      } else {
        b.classList.add('hidden');
      }
    });
  },
};
