/**
 * Google Apps Script — Webhook para recibir data del Monitor P2P BCV
 *
 * INSTRUCCIONES:
 * 1. Abre Google Sheets y crea un nuevo spreadsheet
 * 2. Ve a Extensiones → Apps Script
 * 3. Pega todo este código reemplazando el contenido
 * 4. Click en Implementar → Nueva implementación
 * 5. Tipo: Aplicación web
 * 6. Ejecutar como: Yo mismo
 * 7. Acceso: Cualquier persona
 * 8. Click Implementar y copia la URL del webhook
 * 9. En Vercel → Settings → Environment Variables, agrega:
 *    - GOOGLE_SHEET_WEBHOOK = (la URL que copiaste)
 *    - CRON_SECRET = (un string secreto cualquiera, ej: mi-secreto-123)
 * 10. Redeploy el proyecto en Vercel
 */

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // --- Hoja principal: Resumen ---
    var resumen = ss.getSheetByName("Resumen") || ss.insertSheet("Resumen");
    if (resumen.getLastRow() === 0) {
      resumen.appendRow([
        "Timestamp",
        "USD Oficial",
        "USD Paralelo",
        "EUR Oficial",
        "Total Anuncios",
        "Total Vol USDT",
        "Banesco Mejor", "Banesco Prom", "Banesco Ads", "Banesco Vol",
        "Mercantil Mejor", "Mercantil Prom", "Mercantil Ads", "Mercantil Vol",
        "Provincial Mejor", "Provincial Prom", "Provincial Ads", "Provincial Vol",
        "BNC Mejor", "BNC Prom", "BNC Ads", "BNC Vol",
        "Bancamiga Mejor", "Bancamiga Prom", "Bancamiga Ads", "Bancamiga Vol",
        "BDT Mejor", "BDT Prom", "BDT Ads", "BDT Vol",
        "Banplus Mejor", "Banplus Prom", "Banplus Ads", "Banplus Vol",
        "Plaza Mejor", "Plaza Prom", "Plaza Ads", "Plaza Vol",
        "Activo Mejor", "Activo Prom", "Activo Ads", "Activo Vol",
        "BDV Mejor", "BDV Prom", "BDV Ads", "BDV Vol"
      ]);
      resumen.getRange(1, 1, 1, resumen.getLastColumn()).setFontWeight("bold");
    }

    var row = [
      data.timestamp,
      data.usdOficial,
      data.usdParalelo,
      data.eurOficial,
      data.totalAnuncios,
      data.totalVolumenUsdt
    ];

    var bancos = data.bancos || [];
    for (var i = 0; i < bancos.length; i++) {
      var b = bancos[i];
      row.push(b.mejorPrecio, b.promedio, b.anuncios, b.volumen);
    }

    resumen.appendRow(row);

    // --- Formato de timestamp como fecha ---
    var lastRow = resumen.getLastRow();
    resumen.getRange(lastRow, 1).setNumberFormat("yyyy-mm-dd hh:mm:ss");

    return ContentService.createTextOutput(
      JSON.stringify({ status: "ok", row: lastRow })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: "error", message: err.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || "";
  if (action !== "history") {
    return ContentService.createTextOutput(
      JSON.stringify({ status: "ok", message: "Webhook activo. Usa POST para enviar datos." })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Resumen");
    if (!sheet) {
      return ContentService.createTextOutput(
        JSON.stringify({ data: [] })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    var maxRows = parseInt(e.parameter.rows) || 2000;
    if (maxRows > 100000) maxRows = 100000;
    var offset = parseInt(e.parameter.offset) || 0;

    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return ContentService.createTextOutput(
        JSON.stringify({ data: [], totalRows: 0 })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    var totalDataRows = lastRow - 1;
    var endRow = lastRow - offset;
    if (endRow < 2) {
      return ContentService.createTextOutput(
        JSON.stringify({ data: [], totalRows: totalDataRows })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    var startRow = Math.max(2, endRow - maxRows + 1);
    var numRows = endRow - startRow + 1;
    var numCols = sheet.getLastColumn();
    var values = sheet.getRange(startRow, 1, numRows, numCols).getValues();

    var banks = ["Banesco", "Mercantil", "Provincial", "BNC", "Bancamiga",
                 "BDT", "Banplus", "Plaza", "Activo", "BDV"];

    var data = [];
    for (var r = 0; r < values.length; r++) {
      var row = values[r];
      var ts = row[0];
      var epoch;
      if (ts instanceof Date) {
        epoch = Math.floor(ts.getTime() / 1000);
      } else {
        epoch = Math.floor(new Date(ts).getTime() / 1000);
      }
      if (isNaN(epoch)) continue;

      var entry = {
        t: epoch,
        usd: row[1] || null,
        par: row[2] || null,
        eur: row[3] || null,
        b: {}
      };

      for (var i = 0; i < banks.length; i++) {
        var base = 6 + (i * 4);
        var mejor = row[base] || null;
        var prom = row[base + 1] || null;
        if (mejor || prom) {
          entry.b[banks[i]] = [mejor, prom];
        }
      }

      data.push(entry);
    }

    return ContentService.createTextOutput(
      JSON.stringify({ data: data, totalRows: totalDataRows })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ error: err.toString(), data: [] })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
