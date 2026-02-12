import os
import json
import re
from typing import List, Dict, Any, Optional

# --- VOLVEMOS A GOOGLE (Lo rápido) ---
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_pinecone import PineconeVectorStore
from langchain.prompts import PromptTemplate
from langchain.schema import StrOutputParser
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_core.documents import Document

# Base de datos SQL
from app.db.session import SessionLocal
from app.db.models import AppSettings, TokenUsageLog

# Librería Nativa de Pinecone
from pinecone import Pinecone

# Configuración
from app.core.config import settings

# --- VARIABLES GLOBALES (LAZY LOADING) ---
_embeddings = None
_vector_store = None
_pc_index = None
_llm = None

index_name = "autobid-index"

# --- HELPER LOGGING ---
def _log_token_usage(user_id: str, model_name: str, response: Any):
    try:
        token_info = response.response_metadata.get("token_usage", {})
        if not token_info and "usage_metadata" in response.response_metadata:
             token_info = response.response_metadata.get("usage_metadata", {})

        total_tokens = token_info.get("total_tokens", 0)
        
        if total_tokens > 0:
            db = SessionLocal()
            log_entry = TokenUsageLog(
                user_id=user_id,
                model_name=model_name,
                total_tokens=total_tokens,
                input_tokens=token_info.get("prompt_token_count", 0),
                output_tokens=token_info.get("candidates_token_count", 0)
            )
            db.add(log_entry)
            db.commit()
            db.close()
    except Exception as e:
        print(f"⚠️ Error logging tokens: {e}")

# --- SINGLETONS (CARGADORES) ---

def get_embeddings():
    """
    Carga el modelo de Google.
    Ahora que tenemos las librerías actualizadas, el modelo 004 VOLARÁ.
    """
    global _embeddings
    if _embeddings is None:
        print("⚡ Conectando a Google text-embedding-004...")
        _embeddings = GoogleGenerativeAIEmbeddings(
            model="models/text-embedding-004", # Nombre correcto
            google_api_key=settings.GOOGLE_API_KEY,
            # IMPORTANTE: Sin task_type para evitar el bug del 404 en v1beta
        )
        print("✅ Google Embeddings Conectado.")
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

# --- FUNCIONES DE NEGOCIO ---

def clear_active_tender(namespace: str):
    try:
        idx = get_pc_index()
        idx.delete(filter={"category": "active_tender"}, namespace=namespace)
        print(f"🧹 Active tender limpio para {namespace}.")
    except Exception as e:
        print(f"⚠️ Error limpieza: {e}")

def ingest_text(text: str, metadata: dict, namespace: str):
    if not text or len(text.strip()) == 0:
        return {"error": "PDF vacío."}
    
    text = text.replace("\x00", "")
    
    # Import Lazy de privacidad
    if metadata.get("category") != "active_tender":
        try:
            from app.utils.privacy import sanitize_text
            text = sanitize_text(text)
            print("🛡️ PII Redaction aplicado.")
        except Exception:
            pass

    print(f"--- INGESTANDO ({len(text)} chars) -> Google -> Pinecone ---")
    try:
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
        chunks = text_splitter.split_text(text)
        docs = [Document(page_content=chunk, metadata=metadata) for chunk in chunks]
        
        vstore = get_vector_store()
        ids = vstore.add_documents(docs, namespace=namespace)
        
        return {"message": "Procesado con Google 004 🚀", "chunks_count": len(ids)}
    except Exception as e:
        print(f"Error CRÍTICO ingest: {e}")
        # Si falla Google, lanzamos el error para verlo en el log
        raise e

def delete_document_by_source(filename: str, namespace: str):
    try:
        idx = get_pc_index()
        idx.delete(filter={"source_id": filename}, namespace=namespace)
        return True
    except Exception:
        return False

# --- RAG Y CHAT ---

def detect_category(text: str, user_id: str) -> str:
    try:
        llm = get_llm()
        res = llm.invoke(f"Clasifica (CV, Case Study, Financial, Technical, General): {text[:1000]}")
        _log_token_usage(user_id, llm.model, res)
        cat = res.content.strip().replace(".", "")
        return cat if cat in ["CV", "Case Study", "Financial", "Technical"] else "General"
    except:
        return "General"

def extract_key_data(text: str, user_id: str):
    prompt = """Extract JSON: {"industry": str, "budget": int, "technical_score": int, "deadline": "YYYY-MM-DD", "complexity": str}"""
    try:
        llm = get_llm()
        res = llm.invoke(f"{prompt}\nText: {text[:4000]}")
        _log_token_usage(user_id, llm.model, res)
        clean = res.content.replace("```json", "").replace("```", "").strip()
        return json.loads(clean)
    except:
        return {"industry": "Other", "budget": 0, "technical_score": 50, "deadline": None, "complexity": "Medium"}

def ask_gemini_with_context(question: str, namespace: str):
    try:
        vstore = get_vector_store()
        # Búsqueda vectorial rápida
        docs = vstore.similarity_search(question, k=5, filter={"category": "active_tender"}, namespace=namespace)
        
        if not docs: return {"answer": "No hay datos.", "sources": []}

        ctx = "\n".join([d.page_content for d in docs])
        prompt = f"Contexto: {ctx}\nPregunta: {question}\nRespuesta:"
        
        llm = get_llm()
        res = llm.invoke(prompt)
        _log_token_usage(namespace, llm.model, res)
        return {"answer": res.content, "sources": ["match"]}
    except Exception as e:
        return {"answer": "Error.", "error": str(e)}

def stream_ask_gemini(question: str, namespace: str):
    try:
        vstore = get_vector_store()
        docs = vstore.similarity_search(question, k=5, filter={"category": "active_tender"}, namespace=namespace)
        ctx = "\n".join([d.page_content for d in docs]) if docs else ""
        
        chain = PromptTemplate.from_template(f"Contexto: {ctx}\nPregunta: {question}\nRespuesta:") | get_llm() | StrOutputParser()
        
        for chunk in chain.stream({}):
            yield chunk
    except Exception as e:
        yield f"Error: {e}"

def generate_proposal_draft(namespace: str):
    print(f"🤖 Generando propuesta...")
    db = SessionLocal()
    st = db.query(AppSettings).filter(AppSettings.user_id == namespace).first()
    db.close()
    
    c_name = st.company_name if st else "Mi Empresa"
    c_desc = st.company_description if st else "Soluciones IT"
    tone = st.ai_tone if st else "formal"
    
    vstore = get_vector_store()
    llm = get_llm()

    tender_res = vstore.similarity_search("objetivos requisitos", k=6, filter={"category": "active_tender"}, namespace=namespace)
    tender_txt = "\n".join([d.page_content for d in tender_res])

    # Smart Search
    q_res = llm.invoke(f"Based on: '{tender_txt[:500]}...', write a search query for similar case studies.")
    comp_res = vstore.similarity_search(q_res.content, k=5, filter={"category": {"$ne": "active_tender"}}, namespace=namespace)
    comp_txt = "\n".join([d.page_content for d in comp_res])

    prompt = f"""
    ROLE: Bid Manager at {c_name} ({c_desc}). Tone: {tone}.
    CLIENT: {tender_txt}
    OUR EXP: {comp_txt}
    
    OUTPUT: A proposal structure (Exec Summary, Solution, Why Us, Plan).
    FORMAT: Clean text, use # for titles. No **bold**.
    """
    
    res = llm.invoke(prompt)
    _log_token_usage(namespace, llm.model, res)
    return res.content