import pdfplumber

path = "/Users/xue/Downloads/Bar drinks invoices 2026.1-6/2026.06 Tennet/6.12  2946.34 3698984_78324780.pdf"
with pdfplumber.open(path) as pdf:
    page = pdf.pages[2]
    rows = {}
    for word in page.extract_words():
        rows.setdefault(round(word["top"]), []).append(word)
    for top, words in rows.items():
        if 350 < top < 700:
            print(top, " | ".join(f'{word["x0"]:.0f}:{word["text"]}' for word in sorted(words, key=lambda item: item["x0"])))
