import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const input = JSON.parse(await fs.readFile("tmp/pdfs/tennents_invoice_data.json", "utf8"));
const outputDir = "output/tennents-invoice-import";
await fs.mkdir(outputDir, { recursive: true });

// Anchor at UTC noon so Excel/renderers in UK daylight time never display the prior day.
const dateValue = (value) => value ? new Date(`${value}T12:00:00Z`) : null;
const headers = {
  fill: "#123B5D",
  font: { bold: true, color: "#FFFFFF" },
  wrapText: true,
};
const section = { fill: "#DCEAF5", font: { bold: true, color: "#123B5D" } };
const border = { preset: "all", style: "thin", color: "#D8E2EB" };

const wb = Workbook.create();
const readme = wb.worksheets.add("说明");
const summary = wb.worksheets.add("发票汇总");
const detail = wb.worksheets.add("发票明细");
const products = wb.worksheets.add("商品目录");
const review = wb.worksheets.add("需复核");
[readme, summary, detail, products, review].forEach((sheet) => { sheet.showGridLines = false; });

readme.getRange("A1:H1").merge();
readme.getRange("A1").values = [["Tennent 酒水发票预处理包"]];
readme.getRange("A1:H1").format = { fill: "#123B5D", font: { bold: true, color: "#FFFFFF", size: 16 }, horizontalAlignment: "center", verticalAlignment: "center" };
readme.getRange("A3:B8").values = [
  ["用途", "真实写入酒库数据库前的审核数据，不是正式库存导入。"],
  ["来源", "/Users/xue/Downloads/Bar drinks invoices 2026.1-6/"],
  ["文件数", input.documents.length],
  ["发票数", input.documents.filter((row) => row.document_type !== "statement").length],
  ["Statement", input.documents.filter((row) => row.document_type === "statement").length],
  ["待复核发票", input.documents.filter((row) => row.status === "review").length],
];
readme.getRange("A3:A8").format = section;
readme.getRange("A10:H10").merge();
readme.getRange("A10").values = [["判定规则"]];
readme.getRange("A10:H10").format = section;
readme.getRange("A11:H14").values = [
  ["OK", "PDF 行项目 Goods Value 合计与净额一致，且 PDF 总额与文件名金额一致（误差 ≤ £0.02）。", null, null, null, null, null, null],
  ["statement", "仅作为对账参考，不含可导入的商品行。", null, null, null, null, null, null],
  ["review", "发现文件名总额与 PDF 总额不一致，须人工查看原 PDF 后再导入。", null, null, null, null, null, null],
  ["成本", "明细中的 Net Price Per Order Unit 是供应商订货单位的净价；金额单位为 GBP。", null, null, null, null, null, null],
];
readme.getRange("A11:A14").format = section;
readme.getRange("A3:H14").format.borders = border;
readme.getRange("A1:H14").format.wrapText = true;
readme.getRange("A:A").format.columnWidth = 18;
readme.getRange("B:B").format.columnWidth = 80;
readme.getRange("A1:H14").format.rowHeight = 22;
readme.getRange("A1:H1").format.rowHeight = 32;

const summaryHeaders = ["月份", "文件类型", "发票号", "发票日期", "源文件", "页数", "商品行数", "净额 GBP", "VAT GBP", "PDF 总额 GBP", "文件名总额 GBP", "文件名差额 GBP", "行项目差额 GBP", "状态"];
const summaryRows = input.documents.map((row) => [row.month, row.document_type, row.invoice_number || "", dateValue(row.invoice_date), row.source_name, row.pages, row.line_count, row.net_total, row.vat_total, row.document_total, row.filename_total, row.filename_difference, row.line_difference, row.status]);
summary.getRange("A1:N1").values = [summaryHeaders];
summary.getRange("A1:N1").format = headers;
summary.getRange(`A2:N${summaryRows.length + 1}`).values = summaryRows;
summary.getRange(`D2:D${summaryRows.length + 1}`).format.numberFormat = "yyyy-mm-dd";
summary.getRange(`H2:M${summaryRows.length + 1}`).format.numberFormat = "£#,##0.00";
summary.getRange(`A1:N${summaryRows.length + 1}`).format.borders = border;
summary.freezePanes.freezeRows(1);
summary.getRange("A:A").format.columnWidth = 12;
summary.getRange("B:B").format.columnWidth = 14;
summary.getRange("C:C").format.columnWidth = 14;
summary.getRange("D:D").format.columnWidth = 14;
summary.getRange("E:E").format.columnWidth = 46;
summary.getRange("F:G").format.columnWidth = 11;
summary.getRange("H:M").format.columnWidth = 14;
summary.getRange("N:N").format.columnWidth = 12;
summary.tables.add(`A1:N${summaryRows.length + 1}`, true, "InvoiceSummary");

const detailHeaders = ["月份", "发票号", "发票日期", "商品编码", "商品描述", "描述备注", "规格/Size", "订货单位", "数量", "净价 GBP", "Goods Value GBP", "计算金额 GBP", "行差额 GBP", "VAT %", "源文件", "页码"];
detail.getRange("A1:P1").values = [detailHeaders];
detail.getRange("A1:P1").format = headers;
const detailRows = input.lines.map((row) => [row.month, row.invoice_number || "", dateValue(row.invoice_date), row.product_code, row.description, row.description_note, row.size, row.order_unit, row.quantity, row.net_price_per_order_unit, row.goods_value, null, null, row.vat_rate / 100, row.source_name, row.page]);
detail.getRange(`A2:P${detailRows.length + 1}`).values = detailRows;
detail.getRange("L2").formulas = [["=I2*J2"]];
detail.getRange(`L2:L${detailRows.length + 1}`).fillDown();
detail.getRange("M2").formulas = [["=K2-L2"]];
detail.getRange(`M2:M${detailRows.length + 1}`).fillDown();
detail.getRange(`C2:C${detailRows.length + 1}`).format.numberFormat = "yyyy-mm-dd";
detail.getRange(`J2:M${detailRows.length + 1}`).format.numberFormat = "£#,##0.00";
detail.getRange(`N2:N${detailRows.length + 1}`).format.numberFormat = "0%";
detail.getRange(`A1:P${detailRows.length + 1}`).format.borders = border;
detail.getRange(`A1:P${detailRows.length + 1}`).format.wrapText = true;
detail.freezePanes.freezeRows(1);
detail.getRange("A:A").format.columnWidth = 10;
detail.getRange("B:B").format.columnWidth = 14;
detail.getRange("C:C").format.columnWidth = 14;
detail.getRange("D:D").format.columnWidth = 14;
detail.getRange("E:F").format.columnWidth = 34;
detail.getRange("G:H").format.columnWidth = 15;
detail.getRange("I:I").format.columnWidth = 10;
detail.getRange("J:M").format.columnWidth = 14;
detail.getRange("N:N").format.columnWidth = 10;
detail.getRange("O:O").format.columnWidth = 42;
detail.getRange("P:P").format.columnWidth = 8;
detail.tables.add(`A1:P${detailRows.length + 1}`, true, "InvoiceLines");

const productHeaders = ["商品编码", "商品描述", "规格/Size", "订货单位", "发票数", "采购行数", "总订货量", "最低净价 GBP", "最高净价 GBP", "最近净价 GBP", "最近发票日期", "供应商", "匹配状态", "匹配备注"];
products.getRange("A1:N1").values = [productHeaders];
products.getRange("A1:N1").format = headers;
const productRows = input.products.map((row) => [row.product_code, row.description, row.size, row.order_unit, row.invoice_count, row.purchase_line_count, row.total_quantity, row.min_price, row.max_price, row.latest_price, dateValue(row.latest_date), "Tennent", "待匹配酒库酒位", ""]);
products.getRange(`A2:N${productRows.length + 1}`).values = productRows;
products.getRange(`H2:J${productRows.length + 1}`).format.numberFormat = "£#,##0.00";
products.getRange(`K2:K${productRows.length + 1}`).format.numberFormat = "yyyy-mm-dd";
products.getRange(`A1:N${productRows.length + 1}`).format.borders = border;
products.getRange(`A1:N${productRows.length + 1}`).format.wrapText = true;
products.freezePanes.freezeRows(1);
products.getRange("A:A").format.columnWidth = 14;
products.getRange("B:B").format.columnWidth = 42;
products.getRange("C:D").format.columnWidth = 15;
products.getRange("E:G").format.columnWidth = 12;
products.getRange("H:J").format.columnWidth = 15;
products.getRange("K:K").format.columnWidth = 14;
products.getRange("L:L").format.columnWidth = 14;
products.getRange("M:N").format.columnWidth = 22;
products.tables.add(`A1:N${productRows.length + 1}`, true, "ProductCatalogue");

const reviewHeaders = ["源文件", "发票号", "发票日期", "问题", "PDF 总额 GBP", "文件名总额 GBP", "差额 GBP", "建议动作"];
review.getRange("A1:H1").values = [reviewHeaders];
review.getRange("A1:H1").format = headers;
const reviewRows = input.documents.filter((row) => row.status === "review").map((row) => [row.source_name, row.invoice_number || "", dateValue(row.invoice_date), `PDF 总额与文件名金额不一致（${row.filename_difference >= 0 ? "+" : ""}${row.filename_difference.toFixed(2)}）`, row.document_total, row.filename_total, row.filename_difference, "人工打开原 PDF 核对后再决定是否导入"]);
review.getRange(`A2:H${reviewRows.length + 1}`).values = reviewRows;
review.getRange(`C2:C${reviewRows.length + 1}`).format.numberFormat = "yyyy-mm-dd";
review.getRange(`E2:G${reviewRows.length + 1}`).format.numberFormat = "£#,##0.00";
review.getRange(`A1:H${reviewRows.length + 1}`).format.borders = border;
review.getRange(`A1:H${reviewRows.length + 1}`).format.wrapText = true;
review.getRange("A:A").format.columnWidth = 46;
review.getRange("B:B").format.columnWidth = 14;
review.getRange("C:C").format.columnWidth = 14;
review.getRange("D:D").format.columnWidth = 48;
review.getRange("E:G").format.columnWidth = 16;
review.getRange("H:H").format.columnWidth = 48;
review.tables.add(`A1:H${reviewRows.length + 1}`, true, "InvoiceReview");

const summaryPreview = await wb.render({ sheetName: "说明", autoCrop: "all", scale: 1, format: "png" });
await fs.writeFile(`${outputDir}/说明预览.png`, new Uint8Array(await summaryPreview.arrayBuffer()));
const reviewPreview = await wb.render({ sheetName: "需复核", autoCrop: "all", scale: 1, format: "png" });
await fs.writeFile(`${outputDir}/需复核预览.png`, new Uint8Array(await reviewPreview.arrayBuffer()));
const summaryTablePreview = await wb.render({ sheetName: "发票汇总", range: "A1:N22", scale: 1, format: "png" });
await fs.writeFile(`${outputDir}/发票汇总预览.png`, new Uint8Array(await summaryTablePreview.arrayBuffer()));
const detailTablePreview = await wb.render({ sheetName: "发票明细", range: "A1:P18", scale: 1, format: "png" });
await fs.writeFile(`${outputDir}/发票明细预览.png`, new Uint8Array(await detailTablePreview.arrayBuffer()));
const productTablePreview = await wb.render({ sheetName: "商品目录", range: "A1:N22", scale: 1, format: "png" });
await fs.writeFile(`${outputDir}/商品目录预览.png`, new Uint8Array(await productTablePreview.arrayBuffer()));
const inspection = await wb.inspect({ kind: "workbook,sheet,table", maxChars: 5000, tableMaxRows: 4, tableMaxCols: 8 });
console.log(inspection.ndjson);
const formulaErrors = await wb.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 100 }, summary: "formula error scan" });
console.log(formulaErrors.ndjson);
const xlsx = await SpreadsheetFile.exportXlsx(wb);
await xlsx.save(`${outputDir}/tennents_invoice_import_review.xlsx`);
console.log(`saved ${outputDir}/tennents_invoice_import_review.xlsx`);
