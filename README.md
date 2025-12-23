# Local RAG Platform 🤖

A local, privacy-first LLM RAG platform that allows administrators to create and manage domain-specific RAG systems directly from a web UI, while end users interact with a controlled AI assistant.

The platform is **domain-agnostic by design** — the same system can power government, enterprise, research, or private knowledge assistants depending entirely on the documents ingested.

---

## 🚀 Platform Capabilities

### 🔒 Local LLM Inference
Runs fully offline using **GGUF models** via `llama-cpp-python`, ensuring total data privacy and predictable behavior.

### 🏠 Admin-Controlled RAG Pipeline
*   **UI-based document ingestion**: Batch upload PDFs directly through the browser.
*   **Dynamic Vector DB**: Create and update the knowledge base without code changes.
*   **Access Control**: Clear separation between administrative management and user-facing chat.

### 🔍 Advanced Retrieval & Ranking
*   **Embeddings**: `intfloat/e5-small-v2` for high-quality semantic understanding.
*   **Vector Store**: `FAISS` for lightning-fast similarity search.
*   **Reranking**: `BAAI/bge-reranker-large` to ensure the most relevant context is selected.

### 🌐 Secure & Responsive
*   **Role-Based Access**: Admins manage users and knowledge; users query the assistant.
*   **Modern Interface**: Clean, glassmorphism UI designed for internal tools.
*   **Optional Remote Access**: Native Cloudflare Tunnel support for secure remote exposure.

---

## 🎯 Design Philosophy

1.  **Domain Agnostic**: Ingest any document set; the system adapts to the topic.
2.  **Privacy First**: Local inference keeps sensitive data on-premises.
3.  **Controlled Interaction**: Strict separation between admin control and user access.
4.  **Predictable Behavior**: Inspectable retrieval and generation pipeline.

---

## 🔍 Example Use Cases

*   **Internal Enterprise**: Documentation assistants for corporate knowledge.
*   **Research**: Deep exploration of massive document sets.
*   **Compliance**: Regulated or privacy-sensitive knowledge systems.
*   **Offline Support**: On-prem AI assistants for air-gapped environments.

---

## 🛠️ Tech Stack

*   **Backend**: Django 5.x
*   **Frontend**: Vanilla JS + Tailwind CSS
*   **AI / ML**: LangChain, FAISS, Sentence-Transformers, `llama-cpp`
*   **Data Stores**:
    *   **SQLite**: User and access control management.
    *   **FAISS**: Persistent document embeddings.

---

## 📥 Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/local-rag-platform.git
cd local-rag-platform

# Setup virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### ⚙️ Environment Variables
Create a `.env` file in the project root:
```env
SECRET_KEY=your_secret_key
VDB_PATH=vector_store
MODEL_PATH=Model/your_model.gguf
FIREBASE_URL=your_firebase_rtdb_url
```

### 🧠 Model Setup
Place your preferred **GGUF model** in the `Model/` directory.

---

## 🏃 Running the Application

```bash
python manage.py runserver
```

Open [http://localhost:8000](http://localhost:8000) in your browser.

---

## 🧠 How the System Works

| Phase | Description |
| :--- | :--- |
| **Ingestion** | Admin uploads PDFs via UI. Documents are chunked, embedded, and indexed in FAISS. |
| **Retrieval** | User queries trigger semantic search for relevant chunks from the vector store. |
| **Reranking** | Retrieved chunks are reranked using a cross-encoder for improved accuracy. |
| **Generation** | Top context is passed to the local LLM to generate grounded, source-aware responses. |

---

## 🧩 Key Takeaways
This project demonstrates a production-style RAG platform focused on **local deployment**, **admin-driven control**, and **domain flexibility**.

---
*Built for real-world, privacy-sensitive usability.*