import json
import re
from pathlib import Path
import pdfplumber

data = json.loads(Path("tmp/pdfs/tennents_invoice_data.json").read_text())
by_file = {}
for row in data["lines"]:
    by_file.setdefault(row["source_name"], set()).add(row["product_code"])
for doc in data["documents"]:
    if doc["status"] != "review" or doc["document_type"] == "statement":
        continue
    path = Path(doc["source_file"])
    raw = "\n".join(page.extract_text() or "" for page in pdfplumber.open(path).pages)
    codes = []
    for line in raw.splitlines():
        match = re.match(r"\s*([A-Z0-9]{4,12})(?=[A-Z]|\s|\d|\.)", line)
        if match and match.group(1).upper() not in {"INVOICE", "PRODUCT", "TOTAL", "VAT"}:
            codes.append(match.group(1).upper())
    print("\n", path.name, "expected", doc["net_total"], "sum", doc["line_goods_sum"], "missing-ish", sorted(set(codes) - by_file.get(path.name, set())))
    print("raw code lines:", [line[:100] for line in raw.splitlines() if re.match(r"\s*[A-Z0-9]{4,12}", line)][:30])
