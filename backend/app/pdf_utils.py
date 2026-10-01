import os

PDF_DIR = "./uploads/problems"
os.makedirs(PDF_DIR, exist_ok=True)

def generate_minimal_pdf(title: str, code: str, category: str) -> bytes:
    """
    Generates a standard valid PDF 1.4 document containing the contest problem header.
    """
    # Sanitize title for PDF text stream
    clean_title = title.replace("(", "[").replace(")", "]")
    stream_content = f"""BT
/F1 20 Tf
50 730 Td
(HOC VIEN KY THUAT MAT MA - OLP AI KMA 2026) Tj
/F1 15 Tf
0 -40 Td
(DE THI: [{code}] - LINH VUC: {category}) Tj
/F1 13 Tf
0 -30 Td
(Tieu de: {clean_title[:80]}) Tj
/F1 11 Tf
0 -40 Td
(1. MO TA CHUNG:) Tj
0 -20 Td
(Bai toan thuoc chuong trinh Olympic Tri tue Nhan tao cap Hoc vien nam 2026.) Tj
0 -20 Td
(Thi sinh nghien cuu thuat toan va xay dung mo hinh dat diem cao nhat.) Tj
0 -30 Td
(2. QUY DINH NOP BAI:) Tj
0 -20 Td
(- Dinh dang nop: file du doan CSV hoac Model Checkpoint ZIP theo mau.) Tj
0 -20 Td
(- He thong se tu dong danh gia tren tap kiem thu Public/Private Test.) Tj
0 -30 Td
(3. LIEN HE HO TRO:) Tj
0 -20 Td
(Ban To chuc OLP AI KMA 2026 - Email: olpai@actvn.edu.vn) Tj
ET"""
    stream_bytes = stream_content.encode("latin-1", errors="replace")
    stream_length = len(stream_bytes)

    pdf_template = f"""%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length {stream_length} >>
stream
{stream_content}
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000224 00000 n 
0000000300 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
400
%%EOF
"""
    return pdf_template.encode("latin-1", errors="replace")

def ensure_problem_pdf(problem_id: int, code: str, title: str, category: str, existing_filename: str = None) -> str:
    """
    Ensures that a PDF file exists for the problem on disk and returns its filename.
    """
    if existing_filename:
        filepath = os.path.join(PDF_DIR, existing_filename)
        if os.path.exists(filepath):
            return existing_filename

    filename = f"de_thi_{code.lower()}_{category.lower()}.pdf"
    filepath = os.path.join(PDF_DIR, filename)
    if not os.path.exists(filepath):
        pdf_bytes = generate_minimal_pdf(title, code, category)
        with open(filepath, "wb") as f:
            f.write(pdf_bytes)
    return filename
