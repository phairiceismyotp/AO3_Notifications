// ==UserScript==
// @name         AO3 Notifications
// @namespace    https://github.com/phairiceismyotp/AO3_Notifications
// @version      1.0.0
// @description  Show AO3 email notifications via a personal Google Apps Script service.
// @author       phairiceismyotp (or3zz - Nguyen Tin)
// @license      AGPL-3.0-only
// @match        https://archiveofourown.org/*
// @icon         https://archiveofourown.org/favicon.ico
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  const CONFIG = Object.freeze({
    appName: 'AO3 Notifications',
    serviceBaseUrl: 'https://script.google.com/macros/s',
    deploymentIdKey: 'ao3Notifications.deploymentId',
    notificationLimitKey: 'ao3Notifications.notificationLimit',
    readNotificationIdsKeyPrefix: 'ao3Notifications.readNotificationIds',
    fontFamily: 'Cambria, sans-serif',
    defaultNotificationLimit: 20,
    maxNotificationLimit: 50,
    autoRefreshIntervalMs: 5 * 60 * 1000
  });

  const appState = {
    isPanelOpen: false,
    isSettingsOpen: false,
    isLoading: false,
    error: '',
    originalTitle: document.title,
    unreadCount: 0,
    notifications: [],
    readNotificationIds: new Set(),
    readNotificationIdsSyncKey: '',
    readObserver: null,
    host: null,
    root: null
  };

  initWidget();

  function initWidget() {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    appState.host = host;
    appState.root = createElement('div', { id: 'ao3n' });
    shadow.appendChild(createStyleElement());
    shadow.appendChild(appState.root);
    document.documentElement.appendChild(host);
    document.addEventListener('mousedown', closePanelOnOutsideClick, true);
    appState.readNotificationIds = loadReadNotificationIds();
    registerReadNotificationSync();
    renderWidget();
    fetchNotifications();
    window.setInterval(fetchNotifications, CONFIG.autoRefreshIntervalMs);
  }

  async function fetchNotifications(bypassCache) {
    if (appState.isLoading) {
      return;
    }

    const serviceUrl = buildServiceUrl(bypassCache);
    if (!serviceUrl) {
      appState.isSettingsOpen = true;
      appState.error = 'Missing Deployment ID.';
      renderWidget();
      return;
    }

    appState.isLoading = true;
    appState.error = '';
    renderWidget();

    try {
      const payload = await requestServiceJson(serviceUrl);
      if (!payload || payload.ok !== true || !Array.isArray(payload.items)) {
        throw new Error((payload && payload.error) || 'Service returned invalid JSON.');
      }

      const notifications = groupNotifications(payload.items.map(normalizeNotification).filter(Boolean))
        .sort(compareNewestFirst)
        .slice(0, getNotificationLimit());
      appState.notifications = notifications;
    } catch (error) {
      appState.error = error && error.message ? error.message : String(error);
    } finally {
      appState.isLoading = false;
      renderWidget();
    }
  }

  function requestServiceJson(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout: 30000,
        onload: (response) => {
          if (response.status < 200 || response.status >= 300) {
            reject(new Error(`Service HTTP ${response.status}.`));
            return;
          }
          try {
            resolve(JSON.parse(response.responseText || '{}'));
          } catch {
            reject(new Error('Could not parse service response.'));
          }
        },
        onerror: () => reject(new Error('Could not reach service.')),
        ontimeout: () => reject(new Error('Service request timed out.'))
      });
    });
  }

  function renderWidget() {
    syncTheme();
    if (appState.readObserver) {
      appState.readObserver.disconnect();
      appState.readObserver = null;
    }
    appState.root.textContent = '';
    appState.root.appendChild(createElement('button', {
      className: 'launcher',
      type: 'button',
      title: CONFIG.appName,
      onclick: togglePanel
    }, [createBellIcon(), createElement('span', { className: 'badge' }, [createText(String(appState.unreadCount))])]));
    syncNotificationState();

    if (!appState.isPanelOpen) {
      return;
    }

    const panel = createElement('section', { className: 'panel', role: 'dialog', 'aria-label': CONFIG.appName }, [
      renderHeader(),
      appState.isSettingsOpen ? renderSettings() : renderFeed()
    ]);
    appState.root.appendChild(panel);
    if (!appState.isSettingsOpen) {
      observeUnreadCards();
    }
  }

  function togglePanel() {
    if (appState.isPanelOpen) {
      return closePanel();
    }
    appState.isPanelOpen = true;
    appState.isSettingsOpen = !hasDeploymentId();
    renderWidget();
  }

  function closePanel() {
    markAsRead(appState.notifications);
    appState.isPanelOpen = false;
    renderWidget();
  }

  function closePanelOnOutsideClick(event) {
    const clickedInside = event.composedPath().includes(appState.host);
    if (!appState.isPanelOpen || clickedInside) {
      return;
    }
    closePanel();
  }

  function renderHeader() {
    return createElement('header', { className: 'header' }, [
      createElement('div', { className: 'brand' }, [
        createElement('strong', {}, [createText(CONFIG.appName)])
      ]),
      createElement('div', { className: 'actions' }, [
        createButton('Refresh', () => fetchNotifications(true), appState.isLoading || !hasDeploymentId()),
        createButton('Settings', () => {
          appState.isSettingsOpen = true;
          renderWidget();
        })
      ])
    ]);
  }

  function renderFeed() {
    const nodes = [];
    if (appState.error) {
      nodes.push(createElement('div', { className: 'message error', role: 'alert' }, [createText(appState.error)]));
    }

    if (!appState.isLoading && !appState.error && !appState.notifications.length) {
      nodes.push(createElement('div', { className: 'message' }, [createText('No AO3 updates found.')]));
    }

    nodes.push(createElement('div', { className: 'list' }, appState.notifications.map(renderNotificationCard)));
    return createElement('div', { className: 'body' }, nodes);
  }

  function renderNotificationCard(notification, index) {
    const primaryLink = notification.chapterLink || notification.workLink;
    const className = `card${index % 2 ? ' is-purple' : ''}${appState.readNotificationIds.has(notification.id) ? ' is-read' : ''}`;
    const metadataRows = [
      notification.seriesName ? renderMetaRow('Series:', createAo3Link(notification.seriesLink, notification.seriesName)) : null,
      notification.relationshipName ? renderMetaRow('Relationship:', notification.relationshipName) : null
    ].filter(Boolean);
    return createElement('article', { className, 'data-id': notification.id }, [
      createElement('h3', { className: 'title' }, [
        createAo3Link(notification.authorLink, notification.authorName || 'Unknown author'),
        createText(' posted '),
        createAo3Link(primaryLink, notification.postedTitle || notification.workTitle || notification.chapterTitle || 'Untitled')
      ]),
      createElement('div', { className: 'details' }, [
        createElement('div', { className: 'metadata' }, metadataRows),
        createElement('time', { className: 'date', dateTime: notification.notifiedAtIso }, [createText(formatDisplayDate(notification.notifiedAtIso))])
      ])
    ]);
  }

  function renderSettings() {
    const deploymentInput = createElement('input', { name: 'deploymentId', type: 'text', value: getDeploymentId(), autocomplete: 'off' });
    const notificationLimitInput = createElement('input', { name: 'notificationLimit', type: 'number', min: '1', max: String(CONFIG.maxNotificationLimit), value: String(getNotificationLimit()) });
    const settingsForm = createElement('form', {
      className: 'settings',
      onsubmit: (event) => {
        event.preventDefault();
        const deploymentId = cleanDeploymentId(deploymentInput.value);
        const notificationLimit = clampNotificationLimit(notificationLimitInput.value);
        if (!isValidDeploymentId(deploymentId)) {
          appState.error = 'Deployment ID is invalid.';
          renderWidget();
          return;
        }
        GM_setValue(CONFIG.deploymentIdKey, deploymentId);
        GM_setValue(CONFIG.notificationLimitKey, notificationLimit);
        appState.readNotificationIds = loadReadNotificationIds();
        registerReadNotificationSync();
        appState.isSettingsOpen = false;
        fetchNotifications();
      }
    }, [
      renderField('Deployment ID', deploymentInput),
      renderField('Number of Notifications', notificationLimitInput),
      createElement('div', { className: 'settings-actions' }, [
        createButton('Save', null, false, 'submit'),
        hasDeploymentId() ? createButton('Cancel', () => {
          appState.isSettingsOpen = false;
          renderWidget();
        }) : createText(''),
        createElement('span', { className: 'credit' }, [
          createText('Code by '),
          createAo3Link('https://github.com/phairiceismyotp', 'phairiceismyotp')
        ])
      ])
    ]);

    return createElement('div', { className: 'body' }, [
      appState.error ? createElement('div', { className: 'message error' }, [createText(appState.error)]) : createText(''),
      settingsForm
    ]);
  }

  function observeUnreadCards() {
    if (appState.readObserver) {
      appState.readObserver.disconnect();
      appState.readObserver = null;
    }
    const observer = new IntersectionObserver((entries) => {
      let readCount = 0;
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }
        observer.unobserve(entry.target);
        const id = entry.target.dataset.id;
        if (id && !appState.readNotificationIds.has(id)) {
          appState.readNotificationIds.add(id);
          readCount += 1;
        }
      });
      if (readCount) {
        saveReadNotificationIds(appState.readNotificationIds);
        syncNotificationState();
      }
    }, { threshold: 0.75 });
    appState.readObserver = observer;
    appState.root.querySelectorAll('.card:not(.is-read)').forEach((card) => observer.observe(card));
  }

  function markAsRead(notifications) {
    const unread = notifications.filter((notification) => !appState.readNotificationIds.has(notification.id));
    unread.forEach((notification) => appState.readNotificationIds.add(notification.id));
    if (unread.length) {
      saveReadNotificationIds(appState.readNotificationIds);
    }
  }

  function syncNotificationState() {
    appState.unreadCount = countUnread();
    appState.root.querySelectorAll('.card').forEach((card) => {
      card.classList.toggle('is-read', appState.readNotificationIds.has(card.dataset.id));
    });
    syncUnreadCountDisplay();
  }

  function syncUnreadCountDisplay() {
    const count = appState.unreadCount;
    const badge = appState.root.querySelector('.badge');
    badge && (badge.textContent = appState.isLoading ? '...' : String(count));
    if (!appState.isLoading) {
      document.title = count > 0 ? `(${count}) ${appState.originalTitle}` : appState.originalTitle;
    }
  }

  function normalizeNotification(rawNotification) {
    if (!rawNotification || typeof rawNotification !== 'object') {
      return null;
    }
    const id = String(rawNotification.id || '');
    const normalized = {
      id,
      messageId: id.split('|')[0],
      notifiedAtIso: String(rawNotification.notifiedAtIso || ''),
      authorName: String(rawNotification.authorName || ''),
      authorLink: String(rawNotification.authorLink || ''),
      workTitle: String(rawNotification.workTitle || ''),
      workLink: String(rawNotification.workLink || ''),
      seriesName: String(rawNotification.seriesName || ''),
      seriesLink: String(rawNotification.seriesLink || ''),
      relationshipName: String(rawNotification.relationshipName || ''),
      chapterTitle: String(rawNotification.chapterTitle || ''),
      chapterNumber: Number(rawNotification.chapterNumber || 0),
      chapterLink: String(rawNotification.chapterLink || ''),
      postedTitle: String(rawNotification.postedTitle || '')
    };
    return normalized.id && normalized.notifiedAtIso && normalized.authorName && normalized.workLink ? normalized : null;
  }

  function groupNotifications(notifications) {
    const groups = new Map();
    notifications.forEach((notification) => {
      const groupKey = `${notification.messageId}|${notification.workLink}`;
      const group = groups.get(groupKey);
      if (!group) {
        groups.set(groupKey, { ...notification, id: groupKey, children: [notification], groupCount: 1 });
        return;
      }
      group.children.push(notification);
      group.groupCount += 1;
      group.seriesName = group.seriesName || notification.seriesName;
      group.seriesLink = group.seriesLink || notification.seriesLink;
      group.relationshipName = group.relationshipName || notification.relationshipName;
    });
    return Array.from(groups.values()).map(finalizeNotificationGroup);
  }

  function finalizeNotificationGroup(group) {
    const { children, groupCount, ...notification } = group;
    if (groupCount < 2) {
      return notification;
    }
    const firstChapter = children.reduce(pickEarlierChapter);
    return {
      ...notification,
      chapterTitle: firstChapter.chapterTitle,
      chapterNumber: firstChapter.chapterNumber,
      chapterLink: firstChapter.chapterLink,
      postedTitle: `${firstChapter.postedTitle || firstChapter.workTitle || firstChapter.chapterTitle} and ${groupCount - 1} more`
    };
  }

  function pickEarlierChapter(current, candidate) {
    const currentNumber = current.chapterNumber || Number.MAX_SAFE_INTEGER;
    const candidateNumber = candidate.chapterNumber || Number.MAX_SAFE_INTEGER;
    return candidateNumber < currentNumber ? candidate : current;
  }

  function compareNewestFirst(left, right) {
    return String(right.notifiedAtIso || '').localeCompare(String(left.notifiedAtIso || ''));
  }

  function countUnread() {
    return appState.notifications.filter((notification) => !appState.readNotificationIds.has(notification.id)).length;
  }

  function buildServiceUrl(bypassCache) {
    const deploymentId = getDeploymentId();
    if (!isValidDeploymentId(deploymentId)) {
      return '';
    }
    return `${CONFIG.serviceBaseUrl}/${deploymentId}/exec${bypassCache ? '?bypassCache=1' : ''}`;
  }

  function getDeploymentId() {
    return cleanDeploymentId(GM_getValue(CONFIG.deploymentIdKey, ''));
  }

  function cleanDeploymentId(value) {
    return String(value || '').trim();
  }

  function isValidDeploymentId(value) {
    return /^[-_A-Za-z0-9]{8,256}$/.test(cleanDeploymentId(value));
  }

  function hasDeploymentId() {
    return isValidDeploymentId(getDeploymentId());
  }

  function registerReadNotificationSync() {
    const storageKey = readNotificationIdsStorageKey();
    if (!storageKey || storageKey === appState.readNotificationIdsSyncKey) {
      return;
    }
    appState.readNotificationIdsSyncKey = storageKey;
    GM_addValueChangeListener(storageKey, (name, oldValue, newValue, remote) => {
      if (remote && name === readNotificationIdsStorageKey()) {
        appState.readNotificationIds = loadReadNotificationIds();
        syncNotificationState();
      }
    });
  }

  function loadReadNotificationIds() {
    const storageKey = readNotificationIdsStorageKey();
    if (!storageKey) {
      return new Set();
    }
    try {
      const ids = JSON.parse(GM_getValue(storageKey, '[]'));
      return new Set(Array.isArray(ids) ? ids : []);
    } catch {
      return new Set();
    }
  }

  function saveReadNotificationIds(ids) {
    const storageKey = readNotificationIdsStorageKey();
    if (storageKey) {
      GM_setValue(storageKey, JSON.stringify(Array.from(ids).slice(-200)));
    }
  }

  function readNotificationIdsStorageKey() {
    const deploymentId = getDeploymentId();
    return isValidDeploymentId(deploymentId) ? `${CONFIG.readNotificationIdsKeyPrefix}.${deploymentId}` : '';
  }

  function getNotificationLimit() {
    return clampNotificationLimit(GM_getValue(CONFIG.notificationLimitKey, CONFIG.defaultNotificationLimit));
  }

  function clampNotificationLimit(value) {
    const parsed = Number(String(value || '').trim());
    return Number.isInteger(parsed) ? Math.max(1, Math.min(CONFIG.maxNotificationLimit, parsed)) : CONFIG.defaultNotificationLimit;
  }

  function createAo3Link(href, label) {
    return href
      ? createElement('a', { href, target: '_blank', rel: 'noopener noreferrer' }, [createText(label || href)])
      : createElement('span', {}, [createText(label || '')]);
  }

  function renderMetaRow(label, value) {
    return createElement('div', { className: 'meta-row' }, [createElement('strong', {}, [createText(label)]), createText(' '), value && value.nodeType ? value : createText(value)]);
  }

  function renderField(label, input) {
    return createElement('label', { className: 'field' }, [createElement('span', {}, [createText(label)]), input]);
  }

  function createButton(label, onClick, disabled, type) {
    return createElement('button', { className: 'button', type: type || 'button', disabled: disabled ? 'disabled' : null, onclick: onClick }, [createText(label)]);
  }

  function formatDisplayDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value || '');
    }
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    const day = String(date.getDate()).padStart(2, '0');
    const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][date.getMonth()];
    return `${time} - ${day} ${month} ${date.getFullYear()}`;
  }

  function syncTheme() {
    const channels = (getComputedStyle(document.body).backgroundColor.match(/\d+/g) || []).slice(0, 3).map(Number);
    const brightness = channels.reduce((total, value) => total + value, 0) / channels.length;
    appState.root.dataset.theme = Number.isFinite(brightness) && brightness < 128 ? 'dark' : 'light';
  }

  function createElement(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([key, value]) => {
      if (value === null || value === undefined) {
        return;
      }
      if (key === 'className') {
        node.className = value;
      } else if (key === 'value') {
        node.value = value;
      } else if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2), value);
      } else {
        node.setAttribute(key, value);
      }
    });
    (children || []).forEach((child) => node.appendChild(child));
    return node;
  }

  function createText(value) {
    return document.createTextNode(value == null ? '' : String(value));
  }

  function createBellIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    svg.setAttribute('class', 'bell');
    svg.setAttribute('viewBox', '0 0 24 24');
    path.setAttribute('d', 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4');
    svg.appendChild(path);
    return svg;
  }

  function createStyleElement() {
    const node = document.createElement('style');
    node.textContent = `
      #ao3n {
        --text: #1d1d1d; --panel: #fff; --panel-border: #c9c9c9; --header: #f8f8f8; --header-border: #ddd;
        --brand: #7b1113; --accent: #8b1820; --muted: #3f3f3f; --button: #fff; --button-text: #222; --button-border: #b9b9b9;
        --blue-title: #153f73; --blue-link: #183e72; --blue-border: #cfdbea; --blue-bg: #eef4fa;
        --purple-title: #8b519f; --purple-border: #d6c3df; --purple-bg: #f8f2f9;
        --message: #f8f8f8; --error-bg: #fff5f5; --error-border: #e0b4b4; --error-text: #7b1113;
        color: var(--text); font: 16px/1.4 ${CONFIG.fontFamily}; letter-spacing: 0;
      }
      #ao3n[data-theme="dark"] {
        --text: #e9e4dc; --panel: #2f2f2f; --panel-border: #555; --header: #242424; --header-border: #555;
        --brand: #ff8a8a; --accent: #ff8a8a; --muted: #d7d0c8; --button: #3a3a3a; --button-text: #f2f2f2; --button-border: #888;
        --blue-title: #9fcaff; --blue-link: #b7d6ff; --blue-border: #3f5f83; --blue-bg: #253242;
        --purple-title: #dca6ee; --purple-border: #654a72; --purple-bg: #382b3f;
        --message: #282828; --error-bg: #3d2828; --error-border: #8b5555; --error-text: #ffd4d4;
      }
      .launcher, .panel { position: fixed; z-index: 2147483647; }
      .launcher { right: 16px; bottom: 18px; display: inline-flex; align-items: center; gap: 6px; min-width: 52px; height: 42px; border: 1px solid #8b1820; border-radius: 4px; background: #990000; color: #fff; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 14px #0004; }
      .bell { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
      .badge { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 999px; background: #fff; color: #990000; font-size: 11px; font-weight: 700; }
      .panel { right: 16px; bottom: 72px; width: min(430px, calc(100vw - 28px)); max-height: calc(100vh - 96px); overflow: hidden; border: 1px solid var(--panel-border); border-radius: 4px; background: var(--panel); box-shadow: 0 12px 36px #0004; }
      .header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 10px; border-bottom: 1px solid var(--header-border); background: var(--header); }
      .brand { min-width: 0; overflow: hidden; }
      .brand strong { display: block; overflow: hidden; color: var(--brand); font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }
      .date, .meta-row { color: var(--muted); font-size: 13px; }
      .actions, .settings-actions { display: flex; gap: 8px; }
      .credit { margin-left: auto; align-self: center; color: var(--text); font-size: 11px; font-style: italic; }
      .credit a { color: inherit; }
      .button { height: 28px; padding: 0 9px; border: 1px solid var(--button-border); border-radius: 4px; background: var(--button); color: var(--button-text); font: inherit; font-size: 12px; font-weight: 700; white-space: nowrap; cursor: pointer; }
      .button:hover { border-color: var(--accent); color: var(--accent); }
      .button:disabled { cursor: default; opacity: .55; }
      .body { max-height: min(430px, calc(100vh - 146px)); overflow: auto; overscroll-behavior: contain; padding: 9px; background: var(--panel); }
      .list { display: grid; gap: 8px; }
      .message { margin: 0 0 8px; padding: 10px; border: 1px solid var(--header-border); border-radius: 4px; background: var(--message); font-size: 13px; }
      .error { border-color: var(--error-border); background: var(--error-bg); color: var(--error-text); }
      .card { position: relative; overflow: hidden; padding: 9px 10px; border: 1px solid var(--blue-border); border-radius: 3px; background: var(--blue-bg); }
      .card.is-read::before { content: ""; position: absolute; top: 0; bottom: 0; left: 0; width: 2px; background: var(--blue-title); pointer-events: none; }
      .card.is-purple { border-color: var(--purple-border); background: var(--purple-bg); }
      .card.is-purple.is-read::before { background: var(--purple-title); }
      .title { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; margin: 0 0 6px; color: var(--blue-title); font-size: 14.5px; line-height: 1.28; font-weight: 700; overflow-wrap: anywhere; }
      .card.is-purple .title, .card.is-purple .title a, .card.is-purple .meta-row a { color: var(--purple-title); }
      a { color: var(--blue-link); text-decoration: none; font-style: italic; }
      a:focus-visible, .button:focus-visible, .launcher:focus-visible, .field input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      a:hover { opacity: .65; }
      .details { display: grid; gap: 4px; }
      .metadata { min-width: 0; overflow-wrap: anywhere; line-height: 1.25; font-weight: 500; }
      .meta-row strong { color: var(--text); font-weight: 700; }
      .date { justify-self: end; white-space: nowrap; }
      .settings { display: grid; gap: 10px; }
      .field { display: grid; gap: 5px; color: var(--text); font-size: 13px; font-weight: 700; }
      .field input { box-sizing: border-box; width: 100%; height: 34px; padding: 0 9px; border: 1px solid var(--button-border); border-radius: 4px; background: var(--button); color: var(--button-text); font: inherit; font-size: 13px; font-weight: 400; }
      @media (max-width: 640px) {
        .launcher { right: 8px; bottom: 8px; }
        .panel { right: 8px; bottom: 60px; width: calc(100vw - 16px); }
        .header { gap: 6px; padding: 6px 8px; }
        .brand strong { max-width: 120px; font-size: 13px; }
        .actions { gap: 3px; }
        .button { padding: 0 6px; }
      }
    `;
    return node;
  }
})();
