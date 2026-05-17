# Privacy and Disclaimer

AO3 Notifications is designed to run in accounts and browsers controlled by the user.

## Data Handling

- `gscript.gs` runs in the user's own Google Apps Script project.
- `gscript.gs` reads matching AO3 notification emails from the user's Gmail account.
- `tampermonkey.js` runs locally in the user's browser through Tampermonkey.
- `tampermonkey.js` stores the Google Apps Script Deployment ID, display limit, and read notification IDs in Tampermonkey storage.
- The project does not send AO3 email data to any server controlled by the author.
- The browser contacts the user's Google Apps Script deployment and AO3 links needed for normal use.

## User Responsibility

Users should review the source code before installing or deploying it, especially because the Google Apps Script file reads Gmail data. Users are responsible for the Google account permissions they grant, the Deployment ID they configure, and any modifications they make.

## Disclaimer

This project is provided as-is, without warranty of any kind. The author is not responsible for lost data, account issues, quota limits, broken notifications, changed AO3/Gmail behavior, security problems caused by user modifications, or any other damages arising from use of this project.

This project is unofficial and is not affiliated with Archive of Our Own, the Organization for Transformative Works, Google, Gmail, or Tampermonkey.
