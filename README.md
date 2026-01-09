# 🤖 AutoBid AI - Intelligent Tender Management System

**AutoBid AI** is a SaaS platform designed to revolutionize tender management and commercial proposal creation. Leveraging **Generative AI (RAG)** and **Machine Learning**, the system analyzes complex tender documents (PDFs), estimates win probability based on historical data, and drafts proposals aligned with company expertise.

## ✨ Key Features

* **📄 Intelligent Document Analysis:** Ingestion and parsing of complex PDFs (Tenders, RFPs) using OCR and Natural Language Processing.
* **🧠 RAG Engine (Retrieval-Augmented Generation):** Semantic search using **Pinecone** and **Google Gemini** to cross-reference client requirements with the company's Knowledge Base (Case studies, CVs, etc.).
* **🔮 Win Probability Prediction:** A Machine Learning model (**Scikit-Learn**) that learns from historical bid data to predict the likelihood of success (`WON`/`LOST`).
* **✍️ Proposal Generator:** Automatic drafting of structured proposals with adaptive tone and strict adherence to technical requirements.
* **🛡️ Privacy & Security:** Automatic anonymization of sensitive data (PII) in uploaded documents using **Microsoft Presidio**.
* **📊 Analytics Dashboard:** Real-time metrics on Pipeline value, Win Rate, and Industry distribution.
* **🔐 Multi-Tenancy:** Secure architecture with user data isolation via **Clerk** authentication.

## 🛠️ Tech Stack

### Frontend
* **Framework:** [Next.js 14](https://nextjs.org/) (App Router)
* **Language:** TypeScript
* **UI/UX:** Tailwind CSS, Shadcn/UI, Lucide Icons
* **Visualization:** Recharts
* **Auth:** Clerk

### Backend
* **Framework:** [FastAPI](https://fastapi.tiangolo.com/) (Python 3.11)
* **Database:** PostgreSQL (via **Neon Tech**) + SQLAlchemy (ORM)
* **Vector DB:** Pinecone (Serverless)
* **AI/LLM:** LangChain, Google Gemini (Flash 2.5)
* **ML & Data:** Pandas, Scikit-learn, Numpy
* **Privacy:** Microsoft Presidio + Spacy (`en_core_web_sm`)

### Infrastructure & Deploy
* **Frontend:** Vercel
* **Backend:** Render (Web Service)
* **Database:** Neon (Serverless Postgres)

## 🏗️ Architecture



The system follows a decoupled microservices architecture:
1.  **Ingestion:** The user uploads a PDF via the Frontend.
2.  **Processing:** FastAPI receives the file, extracts text, and detects PII entities.
3.  **Vectorization:** Clean text is converted into embeddings (Google GenAI) and stored in Pinecone with user-specific metadata (Namespaces).
4.  **Inference:**
    * **RAG:** Retrieves relevant context to answer chat queries or generate proposals.
    * **ML:** The classification model evaluates extracted parameters (Budget, Industry, Deadline) to output a win score.

## 🚀 Local Installation & Setup

Follow these steps to run the project locally.

### Prerequisites
* Node.js 18+
* Python 3.10+
* Docker (Optional, for local DB)

### 1. Clone the repository
```bash
git clone [https://github.com/YOUR_USERNAME/autobid-ai.git](https://github.com/YOUR_USERNAME/autobid-ai.git)
cd autobid-ai

```

### 2. Configure Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python -m spacy download en_core_web_sm

```

Create a `.env` file in `/backend` with your keys:

```env
DATABASE_URL="postgresql://user:pass@host/db"
GOOGLE_API_KEY="AIza..."
PINECONE_API_KEY="pcsk..."
PINECONE_ENV="us-east-1"
CLERK_SECRET_KEY="sk_test..."
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test..."

```

Start the server:

```bash
uvicorn app.main:app --reload

```

### 3. Configure Frontend

```bash
cd ../frontend
npm install  # or pnpm install

```

Create a `.env.local` file in `/frontend`:

```env
NEXT_PUBLIC_API_URL="http://localhost:8000"
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test..."
CLERK_SECRET_KEY="sk_test..."

```

Start the client:

```bash
npm run dev

```

Visit `http://localhost:3000` and you're set! 🎉

## 🧪 Main API Endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/rag/upload-pdf` | Uploads and vectorizes documents to the Knowledge Base. |
| `POST` | `/rag/generate-proposal` | Generates a proposal draft based on the active tender. |
| `POST` | `/ml/force-retrain` | Force retrains the predictive model using historical data. |
| `POST` | `/history/upload` | Uploads past bids to feed the training dataset. |

## 🤝 Contribution

Contributions are welcome. Please open an issue or submit a pull request to discuss major changes.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](https://www.google.com/search?q=LICENSE) file for details.
```
