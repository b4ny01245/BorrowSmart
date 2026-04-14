// ======================
// CONFIG
// ======================
const ASSET_SHEET = "";
const TRANSACTION_SHEET = "";
const FOLDER_ID = "";

// ======================
// ENTRY POINTS
// ======================
function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

// ======================
// MAIN ROUTER
// ======================
function handleRequest(e) {
  let data = {};
  let action = "";

  try {
    if (e.parameter && e.parameter.action) {
      action = e.parameter.action;
      data = e.parameter;
    }

    if (e.postData && e.postData.contents) {
      const body = JSON.parse(e.postData.contents);
      action = body.action;
      data = body;
    }
  } catch (err) {
    return json({ message: "Invalid request format" });
  }

  let result = { message: "Invalid action" };

  switch (action) {
    case "getAssets":
      result = getAssets();
      break;

    case "borrow":
      result = borrowAsset(data);
      break;

    case "return":
      result = returnAsset(data);
      break;

    case "returnWithImage":
      result = returnWithImage(data);
      break;

    case "addAsset":
      result = addAsset(data);
      break;

    case "editAsset":
      result = editAsset(data);
      break;

    case "deleteAsset":
      result = deleteAsset(data);
      break;
  }

  const callback = e.parameter ? e.parameter.callback : null;
  return json(result, callback);
}

// ======================
// GET ASSETS
// ======================
function getAssets() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ASSET_SHEET);
  const rows = sheet.getDataRange().getValues();

  let result = [];

  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;

    const borrowedAt = rows[i][7] || "";
    const returnedAt = rows[i][8] || "";
    const transactionDateTime = rows[i][9] || returnedAt || borrowedAt || "";

    result.push({
      id: rows[i][0],
      name: rows[i][1],
      category: rows[i][2],
      location: rows[i][3],
      status: rows[i][4],
      holder: rows[i][5],
      qr: rows[i][6],
      borrowedAt: borrowedAt,
      returnedAt: returnedAt,
      transactionDateTime: transactionDateTime,
      lastTransactionAt: transactionDateTime
    });
  }

  return result;
}

// ======================
// BORROW
// ======================
function borrowAsset(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ASSET_SHEET);
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.asset) {

      if (rows[i][4] === "Borrowed") {
        return { message: "Asset already borrowed" };
      }

      const borrowedAt = data.borrowedAt || new Date().toISOString();

      sheet.getRange(i + 1, 5).setValue("Borrowed");
      sheet.getRange(i + 1, 6).setValue(data.email);
      sheet.getRange(i + 1, 8).setValue(borrowedAt);
      sheet.getRange(i + 1, 9).setValue("");  // clear returnedAt
      sheet.getRange(i + 1, 10).setValue(borrowedAt);

      logTransaction(data, "BORROW");

      return { message: "Borrow success" };
    }
  }

  return { message: "Asset not found" };
}

// ======================
// RETURN
// ======================
function returnAsset(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ASSET_SHEET);
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.asset) {

      if (rows[i][4] === "Available") {
        return { message: "Already available" };
      }

      if (rows[i][5] !== data.email) {
        return { message: "Not authorized" };
      }

      const returnedAt = data.returnedAt || new Date().toISOString();

      sheet.getRange(i + 1, 5).setValue("Available");
      sheet.getRange(i + 1, 6).setValue("");
      sheet.getRange(i + 1, 9).setValue(returnedAt);
      sheet.getRange(i + 1, 10).setValue(returnedAt);

      logTransaction(data, "RETURN");

      return { message: "Return success" };
    }
  }

  return { message: "Asset not found" };
}

// ======================
// RETURN WITH IMAGE (FIXED SUPPORT)
// ======================
function returnWithImage(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ASSET_SHEET);
  const rows = sheet.getDataRange().getValues();

  let imageUrl = "";

  try {
    if (data.image) {
      const blob = Utilities.newBlob(
        Utilities.base64Decode(data.image.split(",")[1]),
        "image/png",
        "return_" + Date.now() + ".png"
      );

      const folder = DriveApp.getFolderById(FOLDER_ID);
      const file = folder.createFile(blob);
      imageUrl = file.getUrl();
    }
  } catch (err) {
    return { message: "Image upload failed" };
  }

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.asset) {

      if (rows[i][5] !== data.email) {
        return { message: "Not authorized" };
      }

      const returnedAt = data.returnedAt || new Date().toISOString();

      sheet.getRange(i + 1, 5).setValue("Available");
      sheet.getRange(i + 1, 6).setValue("");
      sheet.getRange(i + 1, 9).setValue(returnedAt);
      sheet.getRange(i + 1, 10).setValue(returnedAt);

      logTransaction(data, "RETURN_WITH_IMAGE", imageUrl);

      return {
        message: "Return success",
        image: imageUrl
      };
    }
  }

  return { message: "Asset not found" };
}

// ======================
// ADD ASSET
// ======================
function addAsset(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ASSET_SHEET);

  const qrURL =
    "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=" +
    data.assetID;

  sheet.appendRow([
    data.assetID,
    data.name,
    data.category || "",
    data.location || "",
    "Available",
    "",
    qrURL,
    "",
    "",
    ""
  ]);

  return { message: "Asset added successfully" };
}

// ======================
// EDIT ASSET
// ======================
function editAsset(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ASSET_SHEET);
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.assetID) {

      sheet.getRange(i + 1, 2).setValue(data.name);
      sheet.getRange(i + 1, 3).setValue(data.category);
      sheet.getRange(i + 1, 4).setValue(data.location);

      return { message: "Asset updated" };
    }
  }

  return { message: "Asset not found" };
}

// ======================
// DELETE ASSET
// ======================
function deleteAsset(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ASSET_SHEET);
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.assetID) {

      sheet.deleteRow(i + 1);
      return { message: "Asset deleted" };
    }
  }

  return { message: "Asset not found" };
}

// ======================
// TRANSACTION LOG
// ======================
function logTransaction(data, action, imageUrl = "") {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TRANSACTION_SHEET);

  sheet.appendRow([
    "TRX-" + Date.now(),
    new Date(),
    data.email,
    data.name,
    data.asset,
    action,
    "DONE",
    imageUrl
  ]);
}

// ======================
// JSON RESPONSE
// ======================
/*function json(data, callback) {
  const jsonStr = JSON.stringify(data);

  if (callback) {
    return ContentService
      .createTextOutput(`${callback}(${jsonStr})`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(jsonStr)
    .setMimeType(ContentService.MimeType.JSON);
}*/
function json(data, callback) {
  const output = JSON.stringify(data);

  if (callback) {
    return ContentService
      .createTextOutput(callback + "(" + output + ")")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(output)
    .setMimeType(ContentService.MimeType.JSON);
}