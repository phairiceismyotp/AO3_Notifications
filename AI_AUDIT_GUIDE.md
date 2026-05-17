# AI Audit Guide

This guide helps users perform a quick independent review before installing or deploying the project.

## What To Audit

Review these files:

- `tampermonkey.js`
- `gscript.gs`

Do not upload private Deployment IDs, Gmail data, AO3 emails, or personal sample files unless you have removed private information.

## Suggested AI Prompt

```text
Please audit these two files as a security review before I install them:

1. Identify every external domain or service contacted.
2. Identify every browser or Tampermonkey storage key used.
3. Identify every Google Apps Script or Gmail API capability used.
4. Check whether the code sends email content, account data, or AO3 data to any third-party server.
5. Check for eval, dynamic script loading, obfuscation, hidden network calls, destructive actions, or suspicious behavior.
6. Explain the notification refresh, cache bypass, read/unread count, and stored read IDs in plain language.
7. List any real risks and whether they are expected for this kind of userscript.

Do not rewrite the code unless I ask. Focus on security, privacy, and data flow.
```

## Expected Safe Shape

- `tampermonkey.js` should only connect to the configured Google Apps Script service and AO3 links.
- `gscript.gs` should only read AO3 notification emails from the user's Gmail account.
- Read notification IDs should stay in Tampermonkey storage.
- No email content should be sent to a server controlled by the project author.
- No `eval`, remote script injection, hidden trackers, or unrelated domains should appear.

## Important Limit

AI review is helpful, but it is not a security guarantee. Users should still read the code, verify the domains, and understand the permissions before installing or deploying the project.
