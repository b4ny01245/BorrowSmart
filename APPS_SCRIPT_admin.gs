// =============================================================
// admin.gs  —  BorrowSmart Google Apps Script Backend
// =============================================================

const ADMIN_SHEET = "";

function createCorsResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// =============================================================
// doGet — ALL operations (reads + writes via URL params)
// =============================================================
function doGet(e) {
  if (!e || !e.parameter) e = { parameter: {} };
  Logger.log("[doGet] params=" + JSON.stringify(e.parameter));

  try {
    const p      = e.parameter;
    const action = p.action;

    if (!action) {
      return createCorsResponse({
        success: false,
        error: "Missing 'action' parameter.",
        availableActions: [
          "authenticate",
          "getAdminAccounts", "addAdminAccount", "updateAdminAccount", "deleteAdminAccount",
          "getAssets",        "addAsset",        "editAsset",          "deleteAsset",
          "getAdminEmails",   "sendEmail",       "sendNotificationEmail", "submitMessage",
        ],
      });
    }

    let result;
    switch (action) {

      // ── Auth ──────────────────────────────────────────────
      case "authenticate":
        result = authenticateAdmin(p.username, p.password);
        break;

      // ── Admin accounts ────────────────────────────────────
      case "getAdminAccounts":
        result = getAdminAccounts();
        break;
      case "addAdminAccount":
        result = addAdminAccount(p);
        break;
      case "updateAdminAccount":
        result = updateAdminAccount(p);
        break;
      case "deleteAdminAccount":
        result = deleteAdminAccount(p);
        break;

      // ── Assets ────────────────────────────────────────────
      case "getAssets":
        result = getAssets();
        break;
      case "addAsset":
        result = addAsset(p);
        break;
      case "editAsset":
        result = editAsset(p);
        break;
      case "deleteAsset":
        result = deleteAsset(p);
        break;

      // ── Email / notifications ─────────────────────────────
      case "getAdminEmails":
        result = getAdminEmails();
        break;
      case "sendEmail":
        result = sendEmail(p);
        break;
      case "sendNotificationEmail":
        result = sendNotificationEmail(p);
        break;
      case "submitMessage":
        result = submitMessage(p);
        break;

      default:
        result = { success: false, error: "Unknown action: " + action };
    }

    Logger.log("[doGet] result=" + JSON.stringify(result));
    return createCorsResponse(result);

  } catch (err) {
    Logger.log("[doGet] CRITICAL: " + err.toString());
    return createCorsResponse({ success: false, error: err.toString() });
  }
}

// =============================================================
// doPost — kept for server-side / non-browser callers
// Routes through doGet so logic is never duplicated
// =============================================================
function doPost(e) {
  Logger.log("[doPost] raw=" + (e && e.postData && e.postData.contents));

  try {
    let params = {};
    if (e && e.postData && e.postData.contents) {
      try { params = JSON.parse(e.postData.contents); }
      catch { return createCorsResponse({ success: false, error: "Invalid JSON body." }); }
    }
    if ((!params || !params.action) && e && e.parameter && e.parameter.action) {
      params = e.parameter;
    }
    if (!params.action) {
      return createCorsResponse({ success: false, error: "Missing 'action'." });
    }
    // Route through doGet so all logic lives in one place
    e.parameter = params;
    return doGet(e);

  } catch (err) {
    Logger.log("[doPost] CRITICAL: " + err.toString());
    return createCorsResponse({ success: false, error: err.toString() });
  }
}

// =============================================================
// AUTHENTICATION
// =============================================================
function authenticateAdmin(username, password) {
  if (!username || !password)
    return { success: false, error: "Username and password are required." };

  try {
    const result = getAdminAccounts();
    if (!result.success) return { success: false, error: result.error };

    const account = result.accounts.find(
      (a) => a.username === username && a.password === password
    );
    if (!account) return { success: false, error: "Invalid credentials." };

    updateAdminAccount({ id: account.id, lastLogin: new Date().toISOString() });

    return {
      success: true,
      account: {
        id:        account.id,
        username:  account.username,
        email:     account.email,
        lastLogin: new Date().toISOString(),
      },
    };
  } catch (err) {
    Logger.log("[authenticateAdmin] " + err);
    return { success: false, error: err.toString() };
  }
}

// =============================================================
// ADMIN ACCOUNT MANAGEMENT
// =============================================================
function getAdminAccounts() {
  try {
    let sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ADMIN_SHEET);

    if (!sheet) {
      sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet(ADMIN_SHEET);
      sheet.appendRow(["ID", "Username", "Password", "Email", "Created Date", "Last Login"]);
      sheet.getRange("A1:F1").setFontWeight("bold");
      _addAdminRow(sheet, {
        id: 1, username: "admin", password: "password123",
        email: "admin@gmail.com", createdDate: new Date().toISOString(), lastLogin: "",
      });
    }

    const data     = sheet.getDataRange().getValues();
    const accounts = [];
    for (let i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      accounts.push({
        id:          data[i][0],
        username:    data[i][1] || "",
        password:    data[i][2] || "",
        email:       data[i][3] || "",
        createdDate: data[i][4] || "",
        lastLogin:   data[i][5] || "",
      });
    }
    return { success: true, accounts };
  } catch (err) {
    Logger.log("[getAdminAccounts] " + err);
    return { success: false, error: err.toString() };
  }
}

function addAdminAccount(params) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ADMIN_SHEET);
    if (!sheet) return { success: false, error: "Admin sheet not found." };

    const data = sheet.getDataRange().getValues();
    let maxId  = 0;
    for (let i = 1; i < data.length; i++) {
      if (typeof data[i][0] === "number" && data[i][0] > maxId) maxId = data[i][0];
    }
    const newId = maxId + 1;
    _addAdminRow(sheet, {
      id: newId, username: params.username, password: params.password,
      email: params.email || "", createdDate: params.createdDate || new Date().toISOString(),
      lastLogin: "",
    });
    return { success: true, id: newId };
  } catch (err) {
    Logger.log("[addAdminAccount] " + err);
    return { success: false, error: err.toString() };
  }
}

function _addAdminRow(sheet, a) {
  sheet.appendRow([a.id, a.username, a.password, a.email, a.createdDate, a.lastLogin]);
}

function updateAdminAccount(params) {
  try {
    const id    = parseInt(params.id, 10);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ADMIN_SHEET);
    if (!sheet) return { success: false, error: "Admin sheet not found." };

    const data = sheet.getDataRange().getValues();
    let rowIdx = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == id) { rowIdx = i; break; }
    }
    if (rowIdx === -1) return { success: false, error: "Account not found." };

    sheet.getRange(rowIdx + 1, 1, 1, 6).setValues([[
      id,
      params.username  !== undefined ? params.username  : data[rowIdx][1],
      params.password  !== undefined ? params.password  : data[rowIdx][2],
      params.email     !== undefined ? params.email     : data[rowIdx][3],
      data[rowIdx][4],
      params.lastLogin !== undefined ? params.lastLogin : data[rowIdx][5],
    ]]);
    return { success: true };
  } catch (err) {
    Logger.log("[updateAdminAccount] " + err);
    return { success: false, error: err.toString() };
  }
}

function deleteAdminAccount(params) {
  try {
    const id    = parseInt(params.id, 10);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ADMIN_SHEET);
    if (!sheet) return { success: false, error: "Admin sheet not found." };

    const data = sheet.getDataRange().getValues();
    let rowIdx = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == id) { rowIdx = i; break; }
    }
    if (rowIdx === -1) return { success: false, error: "Account not found." };

    sheet.deleteRow(rowIdx + 1);
    return { success: true };
  } catch (err) {
    Logger.log("[deleteAdminAccount] " + err);
    return { success: false, error: err.toString() };
  }
}

// =============================================================
// ASSET MANAGEMENT
// =============================================================
function getAssets() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Assets");
    if (!sheet) return [];

    const data   = sheet.getDataRange().getValues();
    const assets = [];
    for (let i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      assets.push({
        id:          data[i][0],
        name:        data[i][1] || "",
        category:    data[i][2] || "",
        status:      data[i][3] || "",
        holder:      data[i][4] || "",
        qr:          data[i][5] || "",
        lastUpdated: data[i][6] || "",
      });
    }
    return assets;
  } catch (err) {
    Logger.log("[getAssets] " + err);
    return [];
  }
}

function addAsset(params) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Assets");
    if (!sheet) return { success: false, error: "Assets sheet not found." };

    sheet.appendRow([
      params.assetID  || "",
      params.name     || "",
      params.category || "",
      "Available",
      "",
      "",
      new Date().toISOString(),
    ]);
    return { success: true, message: "Asset added successfully", assetID: params.assetID };
  } catch (err) {
    Logger.log("[addAsset] " + err);
    return { success: false, error: err.toString() };
  }
}

function editAsset(params) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Assets");
    if (!sheet) return { success: false, error: "Assets sheet not found." };

    const data = sheet.getDataRange().getValues();
    let rowIdx = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == params.assetID) { rowIdx = i; break; }
    }
    if (rowIdx === -1) return { success: false, error: "Asset not found." };

    if (params.name     !== undefined) sheet.getRange(rowIdx + 1, 2).setValue(params.name);
    if (params.category !== undefined) sheet.getRange(rowIdx + 1, 3).setValue(params.category);
    sheet.getRange(rowIdx + 1, 7).setValue(new Date().toISOString());
    return { success: true };
  } catch (err) {
    Logger.log("[editAsset] " + err);
    return { success: false, error: err.toString() };
  }
}

function deleteAsset(params) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Assets");
    if (!sheet) return { success: false, error: "Assets sheet not found." };

    const data = sheet.getDataRange().getValues();
    let rowIdx = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == params.assetID) { rowIdx = i; break; }
    }
    if (rowIdx === -1) return { success: false, error: "Asset not found." };

    sheet.deleteRow(rowIdx + 1);
    return { success: true };
  } catch (err) {
    Logger.log("[deleteAsset] " + err);
    return { success: false, error: err.toString() };
  }
}

// =============================================================
// EMAIL / NOTIFICATIONS
// =============================================================
function getAdminEmails() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ADMIN_SHEET);
    if (!sheet) return { success: false, error: "Admin sheet not found." };

    const data   = sheet.getDataRange().getValues();
    const emails = [];
    for (let i = 1; i < data.length; i++) {
      if (data[i][3]) emails.push(data[i][3]);
    }
    return { success: true, emails };
  } catch (err) {
    Logger.log("[getAdminEmails] " + err);
    return { success: false, error: err.toString() };
  }
}

function sendEmail(params) {
  try {
    const { to, subject, message, from = "BorrowSmart System" } = params;
    if (!to || !subject || !message)
      return { success: false, error: "to, subject, and message are required." };

    const adminEmails = getAdminEmails().emails || [];
    if (!adminEmails.includes(to))
      return { success: false, error: "Recipient is not a registered admin." };

    MailApp.sendEmail({
      to,
      subject:  "BorrowSmart: " + subject,
      htmlBody: _buildEmailHtml(from, subject, message),
    });
    return { success: true, message: "Email sent to " + to };
  } catch (err) {
    Logger.log("[sendEmail] " + err);
    return { success: false, error: err.toString() };
  }
}

function sendNotificationEmail(params) {
  try {
    const to      = params.to      || "";
    const subject = params.subject || "[BorrowSmart Notification]";
    const body    = params.body    || "(no body)";

    if (!to || !to.includes("@"))
      return { success: false, error: "Invalid recipient email." };

    const htmlBody = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
        <div style="background:#ec4899;border-radius:10px 10px 0 0;padding:20px 24px;">
          <span style="color:white;font-size:18px;font-weight:700;">&#128273; BorrowSmart</span>
        </div>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;
                    border-radius:0 0 10px 10px;padding:24px;">
          <p style="font-size:15px;color:#1e293b;line-height:1.6;">${body}</p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0;">
          <p style="font-size:12px;color:#94a3b8;">Automatic notification from BorrowSmart.</p>
        </div>
      </div>`;

    MailApp.sendEmail(to, subject, body, { htmlBody });
    return { success: true };
  } catch (err) {
    Logger.log("[sendNotificationEmail] " + err);
    return { success: false, error: err.toString() };
  }
}

function submitMessage(params) {
  try {
    const name    = params.name    || "";
    const message = params.message || "";
    const email   = params.email   || "";

    if (!name || !message)
      return { success: false, error: "Name and message are required." };

    const emailResult = getAdminEmails();
    if (!emailResult.success)
      return { success: false, error: "Could not retrieve admin emails." };

    const adminEmails = emailResult.emails || [];
    if (!adminEmails.length)
      return { success: false, error: "No admin emails configured." };

    const subject  = "New Contact Form Message from " + name;
    const fullMsg  = email ? "[From: " + email + "]\n\n" + message : message;
    const htmlBody = _buildEmailHtml(name, subject, fullMsg);

    adminEmails.forEach((adminEmail) => {
      MailApp.sendEmail({ to: adminEmail, subject: "BorrowSmart: " + subject, htmlBody });
    });

    return { success: true, message: "Your message has been sent." };
  } catch (err) {
    Logger.log("[submitMessage] " + err);
    return { success: false, error: err.toString() };
  }
}

function _buildEmailHtml(from, subject, message) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
      <div style="background:linear-gradient(135deg,#667eea,#764ba2);color:white;
                  padding:30px;border-radius:10px;text-align:center;">
        <h1 style="margin:0;font-size:28px;">BorrowSmart</h1>
        <p style="margin:10px 0 0;opacity:.9;">Asset Management System</p>
      </div>
      <div style="background:#f8f9fa;padding:30px;border-radius:10px;margin:20px 0;">
        <h2 style="color:#333;margin-top:0;">New Message</h2>
        <div style="background:white;padding:20px;border-radius:8px;margin:20px 0;">
          <p style="margin:8px 0;"><strong>From:</strong> ${from}</p>
          <p style="margin:8px 0;"><strong>Date:</strong> ${new Date().toLocaleString()}</p>
          <p style="margin:8px 0;"><strong>Subject:</strong> ${subject}</p>
        </div>
        <div style="background:white;padding:20px;border-radius:8px;border-left:4px solid #667eea;">
          <p style="margin:0 0 10px;font-weight:bold;">Message:</p>
          <p style="margin:0;white-space:pre-wrap;line-height:1.6;">${message}</p>
        </div>
      </div>
      <div style="text-align:center;padding:20px;color:#666;font-size:14px;">
        <p>Sent via BorrowSmart — do not reply to this email.</p>
      </div>
    </div>`;
}

// =============================================================
// SHEET INITIALIZATION
// =============================================================
function onOpen() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let   sheet = ss.getSheetByName(ADMIN_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(ADMIN_SHEET);
    sheet.appendRow(["ID", "Username", "Password", "Email", "Created Date", "Last Login"]);
    sheet.getRange("A1:F1").setFontWeight("bold");
    _addAdminRow(sheet, {
      id: 1, username: "admin", password: "password123",
      email: "admin@gmail.com", createdDate: new Date().toISOString(), lastLogin: "",
    });
  }
}