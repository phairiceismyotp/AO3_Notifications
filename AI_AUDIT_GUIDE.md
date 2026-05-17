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

Context:
This project is an AO3 notification userscript. Some behavior is expected and should not be treated as malicious by itself:
- The userscript injects a visible notification widget into AO3 pages.
- The userscript uses Shadow DOM and high z-index so the widget stays visible above AO3 page content.
- The userscript calls the user's own Google Apps Script deployment.
- The Google Apps Script reads matching AO3 notification emails from the user's own Gmail account.
- Tampermonkey storage is used for Deployment ID, display limit, and read notification IDs.
- AO3 links may open in a new browser tab.

Please distinguish expected behavior from suspicious behavior. Do not label expected behavior as malware unless the code sends data to unrelated third-party servers, hides network calls, steals credentials, obfuscates logic, injects remote scripts, modifies unrelated sites, or performs destructive actions.

1. Identify every external domain or service contacted.
2. Identify every browser or Tampermonkey storage key used.
3. Identify every Google Apps Script or Gmail API capability used.
4. Check whether the code sends email content, account data, or AO3 data to any third-party server.
5. Check for eval, dynamic script loading, obfuscation, hidden network calls, destructive actions, or suspicious behavior.
6. Explain the notification refresh, cache bypass, read/unread count, and stored read IDs in plain language.
7. Classify each finding as one of: expected behavior, user permission risk, privacy risk, security risk, or unclear.
8. List any real risks and explain whether they are inherent to this kind of userscript or avoidable in this codebase.

Do not rewrite the code unless I ask. Focus on security, privacy, data flow, and objective risk classification.
```

## Expected Safe Shape

- `tampermonkey.js` should only connect to the configured Google Apps Script service and AO3 links.
- `gscript.gs` should only read AO3 notification emails from the user's Gmail account.
- Read notification IDs should stay in Tampermonkey storage.
- No email content should be sent to a server controlled by the project author.
- No `eval`, remote script injection, hidden trackers, or unrelated domains should appear.
- Overlay UI, Shadow DOM, fixed positioning, high z-index, Tampermonkey storage, and Gmail access are expected for this project, but users should still verify that they are limited to the stated purpose.

## Important Limit

AI review is helpful, but it is not a security guarantee. Users should still read the code, verify the domains, and understand the permissions before installing or deploying the project.
