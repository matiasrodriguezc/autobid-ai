# 🚀 AutoBid AI

**AutoBid AI** is an intelligent bid assistance platform that leverages Artificial Intelligence and Machine Learning to help companies analyze, evaluate, and generate bid proposals more efficiently and effectively.

Demo [Here](https://autobid-ai.vercel.app)

## 📋 Table of Contents

- [Features](#-features)
- [Technologies](#-technologies)
- [Architecture](#-architecture)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Usage](#-usage)
- [Project Structure](#-project-structure)
- [API](#-api)
- [Deployment](#-deployment)
- [Contributing](#-contributing)
- [License](#-license)

## ✨ Features

### 🤖 Artificial Intelligence
- **Automatic Bid Analysis**: Upload a bid/tender PDF, and the system automatically extracts key information (industry, budget, deadline, technical score).
- **Proposal Generation**: Generate proposal drafts using RAG (Retrieval-Augmented Generation) based on your knowledge base.
- **Smart Chat**: Ask questions about active bids or your knowledge base and get context-aware responses.

### 📊 Machine Learning
- **Win Probability Prediction**: A Machine Learning model (Random Forest) that predicts the probability of winning a bid based on:
  - Industry
  - Budget
  - Technical Score
  - Urgency (days until deadline)
- **Automatic Re-training**: The model automatically retrains when you add new historical bids (won or lost).
- **Explainability**: Uses SHAP to explain the model's predictions.

### 📚 Knowledge Base (RAG)
- **Document Management**: Upload PDF documents (Resumes/CVs, case studies, technical documentation) and organize them by category.
- **Semantic Search**: Uses Pinecone as a vector database for precise semantic searches.
- **Automatic Categorization**: Automatically detects the category of uploaded documents.
- **Multi-tenant**: Each user has their own isolated namespace in Pinecone.

### 📈 Dashboard & Analytics
- **Real-time Statistics**: Visualize KPIs such as success rate, total amount won, and pipeline.
- **Industry Distribution**: Charts showing the distribution of bids by industry.
- **Complete History**: Manage all your bids (active, won, lost) in one place.
- **Bulk Update**: Update the status of multiple bids simultaneously.

### 🔒 Security & Privacy
- **Clerk Authentication**: Robust and secure authentication system.
- **Multi-tenant**: Complete data isolation per user.
- **Data Anonymization**: Uses Presidio to detect and anonymize sensitive information.
- **Token Logging**: Monitors token usage for AI APIs.

## 🛠 Technologies

### Backend
- **FastAPI**: Modern, fast web framework for Python.
- **PostgreSQL**: Relational database.
- **SQLAlchemy**: ORM for Python.
- **Pinecone**: Vector database for RAG.
- **Google Gemini**: Language model for generation and analysis.
- **LangChain**: Framework for LLM applications.
- **scikit-learn**: Machine Learning (Random Forest).
- **SHAP**: ML model explainability.
- **Presidio**: Sensitive data anonymization.

### Frontend
- **Next.js 14**: React framework with App Router.
- **TypeScript**: Static typing.
- **Tailwind CSS**: Utility-first CSS.
- **shadcn/ui**: Modern and accessible UI components.
- **Clerk**: Authentication and user management.
- **Recharts**: Data visualization.
- **React Hook Form**: Form handling.

### DevOps
- **Docker**: Containerization.
- **Docker Compose**: Service orchestration.
- **Uvicorn**: ASGI server for FastAPI.

## 🏗 Architecture


```

┌─────────────────┐
│   Frontend      │
│   (Next.js)     │
│   Port: 3000    │
└────────┬────────┘
│
│ HTTP/REST
│
┌────────▼────────┐
│   Backend      │
│   (FastAPI)    │
│   Port: 8000   │
└────┬───────┬───┘
│       │
│       │
┌────▼───┐ ┌─▼──────────┐
│PostgreSQL│ │  Pinecone  │
│          │ │ (Vector DB)│
└──────────┘ └────────────┘
│
│
┌────▼──────────┐
│ Google Gemini │
│     API      │
└──────────────┘

```

## 📦 Prerequisites

- **Docker** and **Docker Compose** installed.
- **Node.js** 18+ and **pnpm** (for local frontend development).
- **Python** 3.10+ (for local backend development).
- Accounts and API keys for:
  - [Clerk](https://clerk.com) (Authentication)
  - [Google Gemini](https://makersuite.google.com/app/apikey) (AI)
  - [Pinecone](https://www.pinecone.io) (Vector Database)

## 🚀 Installation

### 1. Clone the Repository

```bash
git clone [https://github.com/matiasrodriguezc/autobid-ai.git](https://github.com/matiasrodriguezc/autobid-ai.git)
cd autobid-ai

```

### 2. Configure Environment Variables

Create a `.env` file in the root of the project:

```env
# PostgreSQL Database
POSTGRES_USER=autobid_user
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=autobid_db
POSTGRES_HOST=db
POSTGRES_PORT=5432

# Google Gemini API
GOOGLE_API_KEY=your_google_api_key

# Pinecone
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_ENVIRONMENT=your_environment  # e.g., us-east-1
PINECONE_INDEX_NAME=autobid-index

# Clerk (Frontend)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard

# Backend API URL
NEXT_PUBLIC_API_URL=http://localhost:8000

```

### 3. Start with Docker Compose

```bash
docker-compose up -d

```

This will start:

* PostgreSQL on port 5432
* FastAPI Backend on port 8000

### 4. Start Frontend (Development)

```bash
cd frontend
pnpm install
pnpm dev

```

The frontend will be available at `http://localhost:3000`.

## ⚙️ Configuration

### Create Pinecone Index

Before using the application, you need to create an index in Pinecone:

1. Go to [Pinecone Console](https://app.pinecone.io).
2. Create a new index with:
* **Name**: `autobid-index` (or whatever you specified in `.env`).
* **Dimensions**: `768` (for Gemini embeddings).
* **Metric**: `cosine`.



### Configure Clerk

1. Create an account at [Clerk](https://clerk.com).
2. Create a new application.
3. Copy the API keys and set them in `.env`.
4. Configure the callback URLs in Clerk:
* Sign-in URL: `http://localhost:3000/sign-in`
* Sign-up URL: `http://localhost:3000/sign-up`
* After sign-in URL: `http://localhost:3000/dashboard`



## 📖 Usage

### 1. Log In

Access `http://localhost:3000` and create an account or log in with Clerk.

### 2. Configure Your Company

Go to **Settings** and fill in:

* Company Name
* Description
* Website
* AI Tone (formal, persuasive, technical)
* Creativity Level
* Language

### 3. Upload Knowledge Base

Go to **Knowledge Base** and upload PDF documents:

* Team CVs/Resumes
* Case Studies
* Technical Documentation
* Past Proposals

These documents will be used to generate more accurate proposals.

### 4. Analyze a Bid

1. Go to **Bid Agent**.
2. Upload the Bid/Tender PDF.
3. The system automatically:
* Extracts key information (industry, budget, deadline).
* Calculates win probability using ML.
* Provides explanations for the prediction.



### 5. Generate a Proposal

1. With an active bid loaded, use the chat to ask questions.
2. Or generate a full proposal draft.
3. Edit and personalize it in the **Proposal Editor**.

### 6. Manage History

* **Upload History**: Upload PDFs of past bids (won or lost) to train the model.
* **View Stats**: Check your success rate, total amount won, and pipeline in the dashboard.
* **Update Status**: Mark bids as won/lost to improve future predictions.

## 📁 Project Structure

```
autobid-ai/
├── backend/
│   ├── app/
│   │   ├── core/           # Configuration and security
│   │   ├── db/              # Models and DB session
│   │   ├── services/        # ML and RAG services
│   │   ├── utils/           # Utilities (PDF parser, privacy)
│   │   ├── models_storage/  # Trained ML models
│   │   └── main.py          # FastAPI app
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── app/                 # Next.js App Router
│   │   ├── dashboard/       # Dashboard pages
│   │   └── ...
│   ├── components/          # React components
│   ├── lib/                 # Utilities
│   └── package.json
├── docker-compose.yml
└── README.md

```

## 🔌 API

### Main Endpoints

#### RAG and Knowledge Base

* `POST /rag/upload-pdf` - Upload PDF document
* `GET /rag/documents` - List documents
* `POST /rag/chat` - Chat with knowledge base
* `POST /rag/generate-proposal` - Generate proposal

#### Machine Learning

* `POST /ml/force-retrain` - Force ML model retraining

#### Bids

* `GET /bids` - List bids
* `POST /history/upload` - Upload historical bid
* `POST /bids/finalize` - Finalize draft
* `PUT /bids/bulk-update-status` - Bulk update status
* `DELETE /bids/{bid_id}` - Delete bid

#### Dashboard

* `GET /dashboard/stats` - Dashboard statistics
* `GET /system/stats` - System statistics

#### Settings

* `GET /settings` - Get settings
* `POST /settings` - Update settings

### Interactive Documentation

Once the backend is running, access:

* **Swagger UI**: `http://localhost:8000/docs`
* **ReDoc**: `http://localhost:8000/redoc`

## 🚢 Deployment

### Backend (Vercel, Railway, Render, etc.)

1. Configure environment variables on your platform.
2. Ensure PostgreSQL and Pinecone are accessible.
3. The backend deploys as a standard FastAPI application.

### Frontend (Vercel recommended)

1. Connect your repository to Vercel.
2. Configure environment variables.
3. Vercel will automatically detect Next.js and deploy.

### Database

* **PostgreSQL**: Use a managed service (AWS RDS, Supabase, Neon, etc.).
* **Pinecone**: It is a cloud service, you only need the credentials.

## 🤝 Contributing

Contributions are welcome. Please:

1. Fork the project.
2. Create a branch for your feature (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

## 📝 License

This project is licensed under the MIT License. See the `LICENSE` file for more details.

## 🙏 Acknowledgments

* [FastAPI](https://fastapi.tiangolo.com)
* [Next.js](https://nextjs.org)
* [Clerk](https://clerk.com)
* [Google Gemini](https://deepmind.google/technologies/gemini/)
* [Pinecone](https://www.pinecone.io)
* [shadcn/ui](https://ui.shadcn.com)
