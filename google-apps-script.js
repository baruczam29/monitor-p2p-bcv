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

function doGet() {
  return ContentService.createTextOutput(
    JSON.stringify({ status: "ok", message: "Webhook activo. Usa POST para enviar datos." })
  ).setMimeType(ContentService.MimeType.JSON);
}
