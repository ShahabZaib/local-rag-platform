import os
from pathlib import Path
from typing import List, Tuple

from langchain_community.document_loaders import PyMuPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings


# =========================
# Config
# =========================
EMBEDDING_MODEL = "intfloat/e5-small-v2"
CHUNK_SIZE = 500
CHUNK_OVERLAP = 80

# Your single persistent DB folder (this will contain index.faiss, index.pkl)
VDB_PATH = "MCE_SOURCE"


# =========================
# Helpers
# =========================
def _tag_pages_with_title(pages, pdf_filename: str, pdf_full_path: str):
    """
    Ensures each page has metadata and also prefixes page_content with the file title.
    That way, chunks created later will contain the PDF title in text.
    """
    prefix = f"[PDF_TITLE: {pdf_filename}]\n"
    for p in pages:
        # metadata (for filtering / citation)
        p.metadata["source"] = pdf_filename
        p.metadata["full_path"] = pdf_full_path

        # embed-visible label (so chunk text always includes title)
        # keep it consistent and minimal to avoid wasting tokens
        p.page_content = prefix + p.page_content


def _load_pdfs(folder_path: str) -> Tuple[List, List[str]]:
    """
    Loads all PDFs from folder recursively.
    Returns: (all_pages, failed_files)
    """
    pdf_files = list(Path(folder_path).rglob("*.pdf"))
    if not pdf_files:
        raise ValueError(f"No PDF files found in: {folder_path}")

    all_pages = []
    failed = []

    for pdf_path in pdf_files:
        try:
            loader = PyMuPDFLoader(str(pdf_path))
            pages = loader.load()

            pdf_filename = os.path.basename(pdf_path)
            _tag_pages_with_title(pages, pdf_filename=pdf_filename, pdf_full_path=str(pdf_path))

            all_pages.extend(pages)
        except Exception as e:
            failed.append(str(pdf_path))
            print(f"⚠️ Failed to parse PDF: {pdf_path} | {e}")

    if not all_pages:
        raise ValueError("All PDFs failed to parse; no pages loaded.")

    return all_pages, failed


def _chunk_documents(pages) -> List:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP
    )
    chunks = splitter.split_documents(pages)
    return chunks


def _get_embeddings():
    return HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL)


def _db_exists(vdb_path: str) -> bool:
    return os.path.exists(os.path.join(vdb_path, "index.faiss"))


# =========================
# Main: Create or Update DB
# =========================
def create_or_update_vdb_from_folder(folder_path: str, vdb_path: str = VDB_PATH) -> List[str]:
    """
    If vdb_path/index.faiss does not exist -> create DB
    If it exists -> load and add new chunks
    Always saves back to vdb_path.
    Returns list of failed PDF files.
    """
    os.makedirs(vdb_path, exist_ok=True)

    # 1) Load PDFs
    pages, failed_files = _load_pdfs(folder_path)

    # 2) Chunk them
    chunks = _chunk_documents(pages)

    # 3) Embeddings
    embedding = _get_embeddings()

    # 4) Create or load + add
    if not _db_exists(vdb_path):
        db = FAISS.from_documents(chunks, embedding)
        db.save_local(vdb_path)
        print(f"✅ Created NEW VDB at: {vdb_path} | chunks added: {len(chunks)}")
    else:
        db = FAISS.load_local(vdb_path, embedding, allow_dangerous_deserialization=True)
        db.add_documents(chunks)
        db.save_local(vdb_path)
        print(f"✅ Updated EXISTING VDB at: {vdb_path} | chunks added: {len(chunks)}")

    return failed_files


# =========================
# Optional CLI usage
# =========================
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python build_or_update_vdb.py <folder_with_pdfs>")
        raise SystemExit(1)

    input_folder = sys.argv[1]
    failed = create_or_update_vdb_from_folder(input_folder, vdb_path=VDB_PATH)

    if failed:
        print("\n⚠️ These PDFs failed to parse:")
        for f in failed:
            print(" -", f)
    else:
        print("\n✅ All PDFs processed successfully.")
