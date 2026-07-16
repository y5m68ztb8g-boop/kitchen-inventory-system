import csv
import json
import re
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import pdfplumber

ROOT = Path("/Users/xue/Downloads/Bar drinks invoices 2026.1-6")
OUT = Path("/Users/xue/Documents/Codex/自然生长/tmp/pdfs")
CODE_RE = re.compile(r"^(T\d{8}|\d{6,8}|[A-Z]{2,5}\d{2,4}|[A-Z]\d[A-Z]\d{3}|[A-Z]\d{5})(.*)$", re.I)


def parse_number(parts):
    raw = "".join(parts).replace(" ", "").replace(",", "")
    match = re.search(r"-?\d+(?:\.\d+)?", raw)
    return float(match.group()) if match else None


def cluster_rows(words, tolerance=2.5):
    rows = []
    for word in sorted(words, key=lambda item: (item["top"], item["x0"])):
        for row in reversed(rows[-3:]):
            if abs(row[0] - word["top"]) <= tolerance:
                row[1].append(word)
                break
        else:
            rows.append([word["top"], [word]])
    return [(top, sorted(items, key=lambda item: item["x0"])) for top, items in rows]


def nearby_amount(words, labels, x_min=460, label_x_min=0):
    candidates = [word for word in words if word["text"].lower() in labels and word["x0"] >= label_x_min]
    for label in candidates:
        parts = [word["text"] for word in words if word["x0"] >= x_min and abs(word["top"] - label["top"]) <= 4]
        value = parse_number(parts)
        if value is not None:
            return value
    return None


def filename_total(path):
    match = re.search(r"\b\d{1,2}\.\d{1,2}\s+(\d+\.\d{2})\b", path.stem)
    return float(match.group(1)) if match else None


def parse_date(value):
    if not value:
        return None
    for fmt in ("%d/%m/%y", "%d/%m/%Y"):
        try:
            return datetime.strptime(value, fmt).date().isoformat()
        except ValueError:
            pass
    return None


def parse_document(path):
    month = path.parent.name.split()[0]
    with pdfplumber.open(path) as pdf:
        texts = [page.extract_text() or "" for page in pdf.pages]
        joined = "\n".join(texts)
        upper = (path.name + "\n" + joined[:1500]).upper()
        document_type = "statement" if "STATEMENT" in upper else "credit" if "CREDIT NOTE" in upper else "invoice"
        number_match = re.search(r"(?:Invoice|Credit Note) Number[^\n]*\n\s*(\d+)", joined, re.I)
        invoice_number = number_match.group(1) if number_match else None
        delivery_match = re.search(r"Delivery Date\s+(\d{2}/\d{2}/\d{2,4})", joined, re.I)
        invoice_date_matches = re.findall(r"Invoice Date:\s*(\d{2}/\d{2}/\d{2,4})", joined, re.I)
        invoice_date = parse_date(invoice_date_matches[-1] if invoice_date_matches else delivery_match.group(1) if delivery_match else None)
        all_words = [word for page in pdf.pages for word in page.extract_words()]
        total = nearby_amount(all_words, {"total"}, label_x_min=400)
        net_total = nearby_amount(all_words, {"excluding"})
        expected_total = filename_total(path)
        free_of_charge = "FREE OF CHARGE" in upper
        lines = []

        if document_type in {"invoice", "credit"}:
            for page_number, page in enumerate(pdf.pages, start=1):
                rows = cluster_rows(page.extract_words())
                in_table = False
                current = None
                for top, words in rows:
                    row_text = " ".join(word["text"] for word in words)
                    if "Product" in row_text and "Description" in row_text:
                        in_table = True
                        continue
                    if not in_table:
                        continue
                    if "Pricing Date" in row_text or "Total Excluding" in row_text:
                        current = None
                        if "Pricing Date" in row_text:
                            in_table = False
                        continue
                    first = next((word for word in words if word["x0"] < 75), None)
                    code_match = CODE_RE.match(first["text"]) if first else None
                    if code_match:
                        code, suffix = code_match.groups()
                        description_parts = ([suffix] if suffix else []) + [word["text"] for word in words if 75 <= word["x0"] < 295]
                        size_parts = [word["text"] for word in words if 295 <= word["x0"] < 330]
                        unit_parts = [word["text"] for word in words if 330 <= word["x0"] < 370]
                        qty_parts = [word["text"] for word in words if 370 <= word["x0"] < 405]
                        price_parts = [word["text"] for word in words if 405 <= word["x0"] < 468]
                        goods_parts = [word["text"] for word in words if 468 <= word["x0"] < 522]
                        vat_parts = [word["text"] for word in words if word["x0"] >= 522]
                        current = {
                            "source_file": str(path), "source_name": path.name, "month": month,
                            "document_type": document_type, "invoice_number": invoice_number,
                            "invoice_date": invoice_date, "page": page_number, "product_code": code.upper(),
                            "description": " ".join(part for part in description_parts if part).strip(),
                            "description_note": "", "size": " ".join(size_parts).strip(),
                            "order_unit": " ".join(unit_parts).strip(), "quantity": parse_number(qty_parts),
                            "net_price_per_order_unit": parse_number(price_parts), "goods_value": parse_number(goods_parts),
                            "vat_rate": parse_number(vat_parts),
                        }
                        if all(current[key] is not None for key in ("quantity", "net_price_per_order_unit", "goods_value")):
                            lines.append(current)
                        else:
                            current = None
                    elif current:
                        continuation = " ".join(word["text"] for word in words if 75 <= word["x0"] < 300).strip()
                        if continuation and not any(term in continuation for term in ("Total Excluding", "VAT @")):
                            current["description_note"] = " | ".join(filter(None, [current["description_note"], continuation]))

        line_sum = round(sum(line["goods_value"] or 0 for line in lines), 2)
        if total is None:
            total_match = re.search(r"Total\s*£\s*([\d,]+\.\d{2})", joined, re.I)
            total = float(total_match.group(1).replace(",", "")) if total_match else expected_total
        if net_total is None and total is not None:
            net_total = round(total / 1.2, 2)
        difference = round(line_sum - net_total, 2) if net_total is not None else None
        filename_difference = round(total - expected_total, 2) if total is not None and expected_total is not None else None
        status = "statement" if document_type == "statement" else "free_of_charge" if free_of_charge and line_sum == 0 else "ok" if lines and (difference is None or abs(difference) <= 0.02) and (filename_difference is None or abs(filename_difference) <= 0.02) else "review"
        return {
            "source_file": str(path), "source_name": path.name, "month": month, "document_type": document_type,
            "invoice_number": invoice_number, "invoice_date": invoice_date, "pages": len(pdf.pages),
            "line_count": len(lines), "line_goods_sum": line_sum, "net_total": net_total,
            "vat_total": round(total - net_total, 2) if total is not None and net_total is not None else None,
            "document_total": total, "filename_total": expected_total, "line_difference": difference,
            "filename_difference": filename_difference, "free_of_charge": free_of_charge, "status": status,
        }, lines


documents = []
lines = []
for path in sorted(ROOT.glob("*/*.pdf")):
    document, document_lines = parse_document(path)
    documents.append(document)
    lines.extend(document_lines)
    print(document["status"], document["source_name"], document["invoice_number"], document["line_count"], document["line_difference"])

products = defaultdict(lambda: {"description": "", "size": "", "order_unit": "", "invoice_count": set(), "purchase_count": 0, "total_quantity": 0.0, "latest_date": None, "latest_price": None, "min_price": None, "max_price": None})
for line in lines:
    item = products[line["product_code"]]
    item["description"] = line["description"] or item["description"]
    item["size"] = line["size"] or item["size"]
    item["order_unit"] = line["order_unit"] or item["order_unit"]
    item["invoice_count"].add(line["invoice_number"] or line["source_name"])
    item["purchase_count"] += 1
    item["total_quantity"] += line["quantity"] or 0
    price = line["net_price_per_order_unit"]
    if price is not None:
        item["min_price"] = price if item["min_price"] is None else min(item["min_price"], price)
        item["max_price"] = price if item["max_price"] is None else max(item["max_price"], price)
    if line["invoice_date"] and (item["latest_date"] is None or line["invoice_date"] >= item["latest_date"]):
        item["latest_date"] = line["invoice_date"]
        item["latest_price"] = price

product_rows = []
for code, item in sorted(products.items()):
    product_rows.append({
        "product_code": code, "description": item["description"], "size": item["size"], "order_unit": item["order_unit"],
        "invoice_count": len(item["invoice_count"]), "purchase_line_count": item["purchase_count"],
        "total_quantity": item["total_quantity"], "min_price": item["min_price"], "max_price": item["max_price"],
        "latest_price": item["latest_price"], "latest_date": item["latest_date"],
    })

OUT.mkdir(parents=True, exist_ok=True)
(OUT / "tennents_invoice_data.json").write_text(json.dumps({"documents": documents, "lines": lines, "products": product_rows}, indent=2), encoding="utf-8")
for filename, rows in (("documents.csv", documents), ("invoice_lines.csv", lines), ("products.csv", product_rows)):
    with (OUT / filename).open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]) if rows else [])
        writer.writeheader()
        writer.writerows(rows)
