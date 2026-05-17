'use strict';

const CONFIG = Object.freeze({
  ao3NotificationQuery: 'from:do-not-reply@archiveofourown.org subject:posted -subject:password',
  gmailThreadLimit: 100,
  notificationLimit: 50,
  cacheKey: 'ao3_notifications_cache',
  cacheTtlSeconds: 240
});

function doGet(event) {
  try {
    const scriptCache = CacheService.getScriptCache();
    const bypassCache = event?.parameter?.bypassCache === '1';
    if (!bypassCache) {
      const cachedPayloadJson = scriptCache.get(CONFIG.cacheKey);
      if (cachedPayloadJson) {
        return createJsonResponse_(JSON.parse(cachedPayloadJson));
      }
    }

    const payload = { ok: true, items: readNotificationsFromGmail_() };
    scriptCache.put(CONFIG.cacheKey, JSON.stringify(payload), CONFIG.cacheTtlSeconds);
    return createJsonResponse_(payload);
  } catch (error) {
    return createJsonResponse_({ ok: false, error: String(error?.message || error) });
  }
}

function readNotificationsFromGmail_() {
  const gmailMessages = GmailApp.search(CONFIG.ao3NotificationQuery, 0, CONFIG.gmailThreadLimit)
    .flatMap((thread) => thread.getMessages());
  const notifications = gmailMessages
    .flatMap(parseAo3NotificationMessage_)
    .sort((left, right) => right.notifiedAtIso.localeCompare(left.notifiedAtIso))
    .slice(0, CONFIG.notificationLimit);
  if (gmailMessages.length && !notifications.length) {
    throw new Error('AO3 mail format was not recognized.');
  }
  return notifications;
}

function parseAo3NotificationMessage_(message) {
  const plainText = String(message.getPlainBody() || '').replace(/\r\n?/g, '\n');
  const notificationHeaderMatches = [...plainText.matchAll(/(^|\n)([^\n]+?)\s+\((https:\/\/archiveofourown\.org\/users\/[^\s)]+)\)\s+posted a new\s+(work|chapter)(?:\s+of\s+"([^"]+)")?.*?:/gi)];
  if (!notificationHeaderMatches.length) {
    return [];
  }

  const messageId = message.getId();
  const notifiedAtIso = formatIsoDate_(message.getDate());
  const htmlText = String(message.getBody() || '');
  const seriesLink = ((htmlText.match(/href=["'](https:\/\/archiveofourown\.org\/series\/\d+)["'][^>]*>/i) || [])[1] || '');

  return notificationHeaderMatches.map((headerMatch, index) => {
    const segmentStart = headerMatch.index + headerMatch[0].length;
    const segmentEnd = notificationHeaderMatches[index + 1] ? notificationHeaderMatches[index + 1].index : plainText.length;
    const segment = plainText.slice(segmentStart, segmentEnd);
    const notificationUrl = ((segment.match(/https:\/\/archiveofourown\.org\/works\/\d+(?:\/chapters\/\d+)?/i) || [])[0] || '').replace(/[).,;]+$/g, '');
    const quotedTitles = [...segment.matchAll(/"([^"\n]+)"\s+\([\d,]+\s+words?\)/gi)].map((titleMatch) => normalizeText_(titleMatch[1]));
    const isChapter = /chapter/i.test(headerMatch[4]);
    const workTitle = normalizeText_(headerMatch[5] || quotedTitles[0]);
    const chapterTitle = isChapter ? normalizeText_(quotedTitles[0]) : '';
    const chapterNumber = Number((chapterTitle.match(/^Chapter\s+(\d+)/i) || [])[1] || 0);
    const workLink = ((notificationUrl.match(/^(https:\/\/archiveofourown\.org\/works\/\d+)/i) || [])[1] || '');
    const chapterLink = isChapter ? ((notificationUrl.match(/^(https:\/\/archiveofourown\.org\/works\/\d+\/chapters\/\d+)/i) || [])[1] || '') : '';

    return workLink && workTitle ? {
      id: [messageId, workLink, chapterLink].join('|'),
      notifiedAtIso,
      authorName: normalizeText_(headerMatch[2]),
      authorLink: headerMatch[3].replace(/[).,;]+$/g, ''),
      workTitle,
      workLink,
      seriesName: normalizeText_((segment.match(/^Series:\s*(.+)$/im) || [])[1]).replace(/^Part\s+\d+\s+of\s+/i, ''),
      seriesLink,
      relationshipName: normalizeText_(((segment.match(/^Relationships?:\s*(.+)$/im) || [])[1] || '').split(',')[0]),
      chapterTitle,
      chapterNumber,
      chapterLink,
      postedTitle: isChapter && chapterTitle ? `${chapterTitle} of ${workTitle}` : workTitle
    } : null;
  }).filter(Boolean);
}

function normalizeText_(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function formatIsoDate_(date) {
  return Utilities.formatDate(new Date(date), 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
}

function createJsonResponse_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
