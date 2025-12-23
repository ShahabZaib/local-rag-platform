# ✅ Suggested Full Update Implementation
print("🐍 llm_loader_updated.py MODULE LOADED") # DEBUG IMPORT
# This unified script incorporates all suggested improvements
# Apply this to both `llm_loader_updated.py` and `vector_db_builder.py`

import os
import time
import multiprocessing
from threading import Lock
from llama_cpp import Llama
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain.prompts import PromptTemplate
from sentence_transformers import CrossEncoder
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyPDFLoader
from hashlib import sha256
from typing import List
import re

from pathlib import Path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = PROJECT_ROOT / "Model" / "mistral-7b-instruct-v0.2.Q5_K_M.gguf"
os.environ["CUDA_VISIBLE_DEVICES"] = "0"
os.environ["TOKENIZERS_PARALLELISM"] = "false"
multiprocessing.set_start_method("spawn", force=True)

import functools
import traceback
def debug_trace(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            print(f"\n❌ [DEBUGGER] Error in {func.__name__}: {e}")
            traceback.print_exc()
            raise e
    return wrapper

# --- 🔐 Thread-safe model loader ---
# --- 🔐 Thread-safe model loader ---
model_lock = Lock()
global_model_holder = {"model": None}
global_vector_db_holder = {"db": None}
global_reranker_holder = {"model": None}  # NEW: lazy load reranker too

@debug_trace
def unload_model():
    global_model_holder["model"] = None
    global_vector_db_holder["db"] = None
    global_reranker_holder["model"] = None
    print("⚠️ Model, Reranker, and Vector DB unloaded.")

@debug_trace
def safe_load_model():
    with model_lock:
        if global_model_holder["model"] is not None:
            return global_model_holder["model"]

        mp = Path(MODEL_PATH)
        if not mp.exists():
            raise FileNotFoundError(f"GGUF not found: {mp}")

        try:
            global_model_holder["model"] = Llama(
                model_path=str(mp),         # <-- ensure str()
                n_ctx=4096,
                n_threads=16,
                n_batch=96,
                verbose=False,
                n_gpu_layers=80
            )
            return global_model_holder["model"]
        except Exception as e:
            print(f"⚠️ Model could not be loaded: {e}")
            print("Model could not be loaded. Trying again...")
            time.sleep(0.5)
            try:
                global_model_holder["model"] = Llama(
                    model_path=str(mp),     # <-- ensure str() on retry too
                    n_ctx=4096,
                    n_threads=16,
                    n_batch=96,
                    verbose=False,
                    n_gpu_layers=80
                )
                return global_model_holder["model"]
            except Exception as e2:
                print(f"❌ Second attempt to load model failed: {e2}")
                global_model_holder["model"] = None
                raise RuntimeError(
                    "Model could not be loaded after two attempts. "
                    "Check your model path, file integrity, and llama-cpp build."
                )

@debug_trace
def ensure_model_loaded():
    if global_model_holder["model"] is None:
        safe_load_model()

@debug_trace
def ensure_reranker_loaded():
    if global_reranker_holder["model"] is None:
        # lazy init; loading BAAI/bge-reranker-large is heavy
        global_reranker_holder["model"] = CrossEncoder("BAAI/bge-reranker-large", max_length=512)
    return global_reranker_holder["model"]

@debug_trace
def load_all_vector_dbs(db_folder="MCE_SOURCE", embedding_model="intfloat/e5-small-v2", k=7):
    if not os.path.isdir(db_folder):
        raise FileNotFoundError(f"FAISS folder not found: {db_folder}")

    embedding = HuggingFaceEmbeddings(model_name=embedding_model)
    all_docs, all_paths = [], []

    base_path = os.path.join(db_folder, "index.faiss")
    if os.path.exists(base_path):
        all_paths.append(db_folder)

    for subdir in os.listdir(db_folder):
        full_path = os.path.join(db_folder, subdir)
        if os.path.isdir(full_path) and os.path.exists(os.path.join(full_path, "index.faiss")):
            all_paths.append(full_path)

    for path in all_paths:
        db = FAISS.load_local(path, embedding, allow_dangerous_deserialization=True)
        try:
            docs = db.similarity_search("", k=k)
            all_docs.extend(docs)
        except Exception as e:
            print(f"⚠️ Failed to fetch from {path}: {e}")

    if not all_docs:
        raise ValueError("❌ No documents found in any FAISS DB.")

    print("📂 FAISS DB paths loaded:")
    for path in all_paths:
        print(" -", path)

    db = FAISS.from_documents(all_docs, embedding)
    global_vector_db_holder["db"] = db
    return db


# --- 🧠 Main Query Handler ---
@debug_trace
def query_rag(user_input, chat_history):
    print(f"🚀 query_rag CALLED with input: {user_input[:50]}...") # DEBUG ENTRY
    model = global_model_holder["model"] or safe_load_model()
    reranker = ensure_reranker_loaded()      
    vector_db = global_vector_db_holder["db"] or load_all_vector_dbs()

    total_start = time.time()

    t0 = time.time()
    docs_with_scores = vector_db.similarity_search_with_score("query: " + user_input, k=9)
    print(f"🔍 Vector Search Time: {time.time() - t0:.2f}s")

    filtered = [(doc, score) for doc, score in docs_with_scores if score > 0.3]

    if not filtered:
        return generate_fallback_answer(user_input)

    t1 = time.time()
    docs = [doc for doc, _ in sorted(filtered, key=lambda x: x[1])[:6]]
    pairs = [[user_input, doc.page_content] for doc in docs]
    scores = reranker.predict(pairs)
    print(f"🏷️ Reranking Time: {time.time() - t1:.2f}s")

    reranked = sorted(zip(docs, scores), key=lambda x: x[1], reverse=True)[:3]
    context = "\n".join(f"[Source: {doc.metadata.get('source', 'Unknown')}] {doc.page_content}" for doc, _ in reranked)

    memory = "\n".join(f"Input: {turn['user']}\nAssistant Response: {turn['assistant']}" for turn in chat_history)

    prompt_template = PromptTemplate.from_template("""
You are a helpful assistant. Follow these rules:

Only answer the user question.
Use the retrieved documents below to support your answer.
If something is not in the context, do not invent it.
Be specific, not generic.

MEMORY CONTEXT
{memory}

RETRIEVED DOCUMENTS
{context}

USER QUESTION
{question}

FORMAT
Start with a short paragraph summary.
Use **bold H2 headings** for main sections.
Use bullet points for supporting details.
At the end, include the source (if available).
Then add a suggested follow-up question.

ASSISTANT RESPONSE:
""")

    final_prompt = prompt_template.format(memory=memory, context=context, question=user_input)

    t2 = time.time()
    try:
        result = model(
            final_prompt,
            max_tokens=1000,
            temperature=0.6,
            stop=["Input:", "Assistant Response:"]
        )
        print(f"🧠 LLaMA Inference Time: {time.time() - t2:.2f}s")
    except Exception as e:
        return "⚠️ Failed to generate a response."

    print(f"📦 Total Query Time: {time.time() - total_start:.2f}s")
    cleaned = result["choices"][0]["text"].strip()
    
    return cleaned

# --- 💡 Fallback Answer Generator ---
@debug_trace
def generate_fallback_answer(user_input):
    ensure_model_loaded()  # <-- make sure LLM is ready
    print("📭 No relevant docs found. Using model memory.")
    fallback_prompt = PromptTemplate.from_template("""
You are a helpful assistant. Follow these rules:

Do not create or invent new questions.
Do not rephrase or restate the question from memory.
Do not answer unrelated topics.
Use only what's in your long-term knowledge.
Be concise and relevant.

MEMORY CONTEXT:
{memory}

USER QUESTION:
{question}

FORMAT:
Short paragraph summary
**Bold H2 headings** for key sections
Bullet points for details
End with source if relevant
End with one follow-up question

ASSISTANT RESPONSE:
""")

    prompt = fallback_prompt.format(question=user_input)
    response = global_model_holder["model"](prompt, max_tokens=600, temperature=0.6)
    return response["choices"][0]["text"].strip() + "\n\n**Source**: No source found"



