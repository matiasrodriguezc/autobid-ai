import os
import json
import time
import requests
from typing import List, Dict, Any, Optional

# Interfaces
from langchain_core.embeddings import Embeddings 
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_pinecone import PineconeVectorStore
from langchain.prompts import PromptTemplate
from langchain.schema import StrOutputParser
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_core.documents import Document

# DB
from app.db.session import SessionLocal
from app.db.models import AppSettings, TokenUsageLog
from pinecone import Pinecone
from app.core.config import settings

# --- VARIABLES ---
_embeddings = None
_vector_store = None
_pc_index = None
_llm = None

index_name = "autobid-index"

class GoogleRawRESTEmbeddings(Embeddings):

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.model_name = "models/gemini-embedding-001"
        self.api_url = (
            f"https://generativelanguage.googleapis.com/v1beta/"
            f"{self.model_name}:embedContent"
        )

    def _embed_single(self, text: str) -> List[float]:
        clean_text = text.replace("\n", " ").strip()

        payload = {
            "content": {
                "parts": [{"text": clean_text}]
            }
        }

        for attempt in range(3):
            try:
                response = requests.post(
                    self.api_url,
                    headers={
                        "Content-Type": "application/json",
                        "x-goog-api-key": self.api_key,
                    },
                    json=payload,
                    timeout=20,
                )

                if response.status_code != 200:
                    if response.status_code == 429:
                        time.sleep(2)
                        continue
                    raise RuntimeError(response.text)

                data = response.json()
                return data["embedding"]["values"]

            except Exception as e:
                print(f"⚠️ Retry {attempt+1}: {e}")
                time.sleep(1)

        raise RuntimeError("Fallo total gemini-embedding-001.")

    # 👇 ESTO FALTABA
    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        print(f"⚡ Procesando {len(texts)} textos...")
        return [self._embed_single(t) for t in texts]

    def embed_query(self, text: str) -> List[float]:
        return self._embed_single(text)
# --- CARGADORES ---

def get_embeddings():
    global _embeddings
    if _embeddings is None:
        key = settings.GOOGLE_API_KEY
        if not key: print("❌ FALTA API KEY")
        
        print("⚡ Iniciando Google Raw 004...")
        _embeddings = GoogleRawRESTEmbeddings(api_key=key)
    return _embeddings

def get_vector_store():
    global _vector_store
    if _vector_store is None:
        _vector_store = PineconeVectorStore(
            index_name=index_name,
            embedding=get_embeddings(), 
            pinecone_api_key=settings.PINECONE_API_KEY
        )
    return _vector_store

def get_pc_index():
    global _pc_index
    if _pc_index is None:
        pc = Pinecone(api_key=settings.PINECONE_API_KEY)
        _pc_index = pc.Index(index_name)
    return _pc_index

def get_llm():
    global _llm
    if _llm is None:
        _llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash", 
            temperature=0.3,
            google_api_key=settings.GOOGLE_API_KEY
        )
    return _llm

# --- UTILS Y NEGOCIO ---

def _log_token_usage(user_id: str, model_name: str, response: Any):
    try:
        token_info = response.response_metadata.get("token_usage", {}) or response.response_metadata.get("usage_metadata", {})
        if token_info.get("total_tokens", 0) > 0:
            db = SessionLocal()
            db.add(TokenUsageLog(
                user_id=user_id, model_name=model_name, total_tokens=token_info.get("total_tokens"),
                input_tokens=token_info.get("prompt_token_count"),
                output_tokens=token_info.get("candidates_token_count")
            ))
            db.commit()
            db.close()
    except: pass

def clear_active_tender(namespace: str):
    try: get_pc_index().delete(filter={"category": "active_tender"}, namespace=namespace)
    except: pass

def ingest_text(text: str, metadata: dict, namespace: str):
    if not text: return {"error": "Vacío"}
    text = text.replace("\x00", "")
    
    if metadata.get("category") != "active_tender":
        try:
            from app.utils.privacy import sanitize_text
            text = sanitize_text(text)
        except: pass

    try:
        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
        chunks = splitter.split_text(text)
        docs = [Document(page_content=c, metadata=metadata) for c in chunks]
        
        print(f"📡 Vectorizando {len(chunks)} chunks...")
        ids = get_vector_store().add_documents(docs, namespace=namespace)
        return {"message": "Éxito (Google 004) 🚀", "chunks_count": len(ids)}
    except Exception as e:
        print(f"❌ Error Ingest: {e}")
        raise e

def delete_document_by_source(filename: str, namespace: str):
    try:
        get_pc_index().delete(filter={"source_id": filename}, namespace=namespace)
        return True
    except: return False

def detect_category(text: str, user_id: str) -> str:
    try:
        llm = get_llm()
        res = llm.invoke(f"Clasifica (CV, Case Study, Financial, Technical, General): {text[:1000]}")
        _log_token_usage(user_id, llm.model, res)
        cat = res.content.strip().replace(".", "")
        return cat if cat in ["CV", "Case Study", "Financial", "Technical"] else "General"
    except: return "General"

def extract_key_data(text: str, user_id: str):
    try:
        llm = get_llm()
        res = llm.invoke(f"""Extract JSON: {{"industry": str, "budget": int, "technical_score": int, "deadline": "YYYY-MM-DD", "complexity": str}}\nText: {text[:4000]}""")
        _log_token_usage(user_id, llm.model, res)
        return json.loads(res.content.replace("```json", "").replace("```", "").strip())
    except: return {"industry": "Other", "budget": 0, "technical_score": 50, "deadline": None, "complexity": "Medium"}

def ask_gemini_with_context(question: str, namespace: str):
    try:
        docs = get_vector_store().similarity_search(question, k=5, filter={"category": "active_tender"}, namespace=namespace)
        if not docs: return {"answer": "Sin datos.", "sources": []}
        llm = get_llm()
        res = llm.invoke(f"Contexto: {' '.join([d.page_content for d in docs])}\nPregunta: {question}")
        _log_token_usage(namespace, llm.model, res)
        return {"answer": res.content, "sources": ["match"]}
    except Exception as e: return {"answer": f"Error: {str(e)}", "error": str(e)}

def stream_ask_gemini(question: str, namespace: str):
    try:
        docs = get_vector_store().similarity_search(question, k=5, filter={"category": "active_tender"}, namespace=namespace)
        chain = PromptTemplate.from_template(f"Contexto: {' '.join([d.page_content for d in docs]) if docs else ''}\nPregunta: {question}") | get_llm() | StrOutputParser()
        for chunk in chain.stream({}): yield chunk
    except Exception as e: yield f"Error: {e}"

def generate_proposal_draft(namespace: str):
    vstore = get_vector_store()
    llm = get_llm()
    try:
        tender = " ".join([d.page_content for d in vstore.similarity_search("objetivos", k=6, filter={"category": "active_tender"}, namespace=namespace)])
        q = llm.invoke(f"Search query based on: {tender[:500]}").content
        company = " ".join([d.page_content for d in vstore.similarity_search(q, k=5, filter={"category": {"$ne": "active_tender"}}, namespace=namespace)])
        
        db = SessionLocal()
        st = db.query(AppSettings).filter(AppSettings.user_id == namespace).first()
        db.close()
        
        res = llm.invoke(f"Role: Bid Manager at {st.company_name if st else 'Us'}. Tender: {tender}. Our Exp: {company}. Write proposal.")
        _log_token_usage(namespace, llm.model, res)
        return res.content
    except Exception as e: return f"Error: {e}"