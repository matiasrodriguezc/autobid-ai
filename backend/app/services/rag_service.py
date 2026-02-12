import os
import json
import time
import requests
from typing import List, Dict, Any, Optional

# LangChain y Pinecone
from langchain_community.embeddings import HuggingFaceInferenceAPIEmbeddings
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_pinecone import PineconeVectorStore
from langchain.prompts import PromptTemplate
from langchain.schema import StrOutputParser
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_core.documents import Document

# Base de datos
from app.db.session import SessionLocal
from app.db.models import AppSettings, TokenUsageLog
from pinecone import Pinecone
from app.core.config import settings

# --- VARIABLES GLOBALES ---
_embeddings = None
_vector_store = None
_pc_index = None
_llm = None

index_name = "autobid-index"

# --- CLASE BLINDADA (VERSIÓN 3 - URL FIX) ---
class RobustHFEmbeddings(HuggingFaceInferenceAPIEmbeddings):
    """
    Versión que valida vectores y fuerza la URL nueva.
    """
    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        for attempt in range(10):
            try:
                # 1. Llamada a la API
                result = super().embed_documents(texts)
                
                # 2. VALIDACIÓN ESTRICTA
                if not isinstance(result, list):
                    raise ValueError(f"HF API devolvió un formato inválido: {result}")
                
                if len(result) > 0 and (not isinstance(result[0], list) or isinstance(result[0], str)):
                     raise ValueError(f"HF API devolvió datos inválidos: {result}")

                return result

            except Exception as e:
                error_msg = str(e).lower()
                print(f"⚠️ Intento {attempt+1}/10 fallido. HF Status: {error_msg}")
                
                if "401" in error_msg or "unauthorized" in error_msg:
                    print("❌ ERROR DE TOKEN: Revisa HUGGINGFACEHUB_API_TOKEN en Render.")
                    raise e
                
                print(f"⏳ Esperando 5 segundos a que el modelo despierte...")
                time.sleep(5)
                continue
        
        raise RuntimeError("HuggingFace no respondió vectores válidos tras 10 intentos.")

    def embed_query(self, text: str) -> List[float]:
        for attempt in range(10):
            try:
                result = super().embed_query(text)
                if not isinstance(result, list):
                    raise ValueError(f"HF Error: {result}")
                return result
            except Exception as e:
                print(f"⏳ HF Query Loading... ({e})")
                time.sleep(5)
                continue
        raise RuntimeError("HF Timeout")

# --- CARGADORES (SINGLETONS) ---

def get_embeddings():
    global _embeddings
    if _embeddings is None:
        key = os.getenv("HUGGINGFACEHUB_API_TOKEN")
        if not key:
            print("❌ CRÍTICO: FALTA EL TOKEN DE HUGGINGFACE EN RENDER")
        
        print("☁️ Conectando a HuggingFace API (New Router URL)...")
        
        # --- AQUÍ ESTÁ EL ARREGLO CLAVE ---
        # Forzamos la URL nueva que pide el error
        model = "sentence-transformers/all-MiniLM-L6-v2"
        api_url = f"https://router.huggingface.co/hf-inference/models/{model}"
        
        _embeddings = RobustHFEmbeddings(
            api_key=key,
            model_name=model,
            api_url=api_url  # <--- ESTO SOLUCIONA EL ERROR DE "NO SUPPORTED"
        )
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

# --- UTILS ---
def _log_token_usage(user_id: str, model_name: str, response: Any):
    try:
        token_info = response.response_metadata.get("token_usage", {}) or response.response_metadata.get("usage_metadata", {})
        total = token_info.get("total_tokens", 0)
        if total > 0:
            db = SessionLocal()
            db.add(TokenUsageLog(
                user_id=user_id, model_name=model_name, total_tokens=total,
                input_tokens=token_info.get("prompt_token_count", 0),
                output_tokens=token_info.get("candidates_token_count", 0)
            ))
            db.commit()
            db.close()
    except: pass

# --- LOGICA DE NEGOCIO ---

def clear_active_tender(namespace: str):
    try: get_pc_index().delete(filter={"category": "active_tender"}, namespace=namespace)
    except: pass

def ingest_text(text: str, metadata: dict, namespace: str):
    if not text: return {"error": "Texto vacío"}
    text = text.replace("\x00", "")
    
    # Lazy Import de privacidad
    if metadata.get("category") != "active_tender":
        try:
            from app.utils.privacy import sanitize_text
            text = sanitize_text(text)
        except: pass

    try:
        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
        chunks = splitter.split_text(text)
        docs = [Document(page_content=c, metadata=metadata) for c in chunks]
        
        print(f"📡 Enviando {len(chunks)} fragmentos a HuggingFace Router...")
        
        ids = get_vector_store().add_documents(docs, namespace=namespace)
        
        return {"message": "Guardado exitoso (HF Router) 🚀", "chunks_count": len(ids)}
    except Exception as e:
        print(f"❌ Error CRÍTICO Ingest: {e}")
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
        # 1. Buscar info del Tender
        tender_res = vstore.similarity_search("objetivos", k=6, filter={"category": "active_tender"}, namespace=namespace)
        tender_txt = " ".join([d.page_content for d in tender_res])

        # 2. Buscar info de la Empresa (Smart Search)
        q_res = llm.invoke(f"Search query based on: {tender_txt[:500]}").content
        comp_res = vstore.similarity_search(q_res, k=5, filter={"category": {"$ne": "active_tender"}}, namespace=namespace)
        comp_txt = " ".join([d.page_content for d in comp_res])
        
        # 3. Obtener datos de la DB
        db = SessionLocal()
        st = db.query(AppSettings).filter(AppSettings.user_id == namespace).first()
        db.close()
        
        # 4. Generar Prompt
        prompt = f"Role: Bid Manager at {st.company_name if st else 'Us'}. Tender: {tender_txt}. Our Exp: {comp_txt}. Write proposal."
        
        # 5. Invocar LLM
        res = llm.invoke(prompt)
        _log_token_usage(namespace, llm.model, res)
        return res.content

    except Exception as e:
        print(f"❌ Error generando propuesta: {e}")
        return f"Error generando propuesta: {str(e)}"