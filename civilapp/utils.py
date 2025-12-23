def extract_text_from_file(uploaded_file):
    import io

    ext = uploaded_file.name.lower()

    if ext.endswith(".txt"):
        return uploaded_file.read().decode("utf-8", errors="ignore")

    elif ext.endswith(".pdf"):
        from PyPDF2 import PdfReader
        try:
            reader = PdfReader(uploaded_file)
            texts = []
            for page in reader.pages:
                try:
                    text = page.extract_text()
                    if text:
                        cleaned = text.encode("utf-8", errors="ignore").decode("utf-8", errors="ignore")
                        texts.append(cleaned)
                except:
                    continue
            return "\n".join(texts) if texts else "[No readable text in PDF]"
        except Exception as e:
            return f"[PDF Extraction Failed: {e}]"

    elif ext.endswith(".docx"):
        from docx import Document
        try:
            doc = Document(uploaded_file)
            return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        except Exception as e:
            return f"[DOCX Extraction Failed: {e}]"

    return "[Unsupported file format]"
