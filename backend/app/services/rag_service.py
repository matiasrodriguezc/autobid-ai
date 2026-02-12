import os
import json
import time
from typing import List, Dict, Any, Optional

# USAMOS LA LIBRERÍA OFICIAL DE GOOGLE
import google.generativeai as genai

# Interfaces necesarias
from langchain_core.embeddings import Embeddings 
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

# --- CLASE GOOGLE 001 (LEGACY) ---
class GoogleLegacyEmbeddings(Embeddings):
    """
    Usa el modelo 'models/embedding-001'.
    Este modelo devuelve SIEMPRE vectores de 768 dimensiones.
    """
    def __init__(self, api_key):
        genai.configure(api_key=api_key)
        self.model_name = "models/text-embedding-gecko-001"

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        # Google permite batching. Procesamos en lotes.
        batch_size = 20 # 001 a veces es más restrictivo con el tamaño del batch
        all_embeddings = []
        
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i+batch_size]
            try:
                # Llamada directa al modelo 001
                result = genai.embed_content(
                    model=self.model_name,
                    content=batch
                )
                
                # Manejo de respuesta de la API de Google
                if 'embedding' in result:
                    # La API puede devolver una lista de vectores o un solo vector
                    # Si enviamos una lista (batch), embedding debería ser una lista de listas
                    embeddings_batch = result['embedding']
                    
                    # Verificación defensiva: ¿Es lista de listas?
                    if isinstance(embeddings_batch, list) and len(embeddings_batch) > 0:
                        if isinstance(embeddings_batch[0], list):
                            all_embeddings.extend(embeddings_batch)
                        else:
                            # Caso raro: devolvió un solo vector plano (no debería pasar en batch)
                            all_embeddings.append(embeddings_batch)
                
            except Exception as e:
                print(f"❌ Error Google 001 Batch: {e}")
                time.sleep(1) # Espera y reintenta
                try:
                    result = genai.embed_content(model=self.model_name, content=batch)
                    all_embeddings.extend(result['embedding'])
                except Exception as e2:
                    print(f"❌ Falló reintento: {e2}")
                    raise e2

        return all_embeddings

    def embed_query(self, text: str) -> List[float]:
        try:
            result = genai.embed_content(
                model=self.model_name,
                content=text
            )
            return result['embedding']
        except Exception as e:
            print(f"❌ Error Google 001 Query: {e}")
            raise e

# --- CARGADORES (SINGLETONS) ---

def get_embeddings():
    global _embeddings
    if _embeddings is None:
        key = settings.GOOGLE_API_KEY
        if not key:
            print("❌ CRÍTICO: FALTA GOOGLE_API_KEY")
        
        print("⚡ Conectando a Google (Modelo 001 - 768 dims)...")
        _embeddings = GoogleLegacyEmbeddings(api_key=key)
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
    
    if metadata.get("category") != "active_tender":
        try:
            from app.utils.privacy import sanitize_text
            text = sanitize_text(text)
        except: pass

    try:
        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
        chunks = splitter.split_text(text)
        docs = [Document(page_content=c, metadata=metadata) for c in chunks]
        
        print(f"📡 Vectorizando {len(chunks)} fragmentos con Google 001...")
        
        ids = get_vector_store().add_documents(docs, namespace=namespace)
        
        return {"message": "Guardado exitoso (Google 001) 🚀", "chunks_count": len(ids)}
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
        tender_res = vstore.similarity_search("objetivos", k=6, filter={"category": "active_tender"}, namespace=namespace)
        tender_txt = " ".join([d.page_content for d in tender_res])

        q_res = llm.invoke(f"Search query based on: {tender_txt[:500]}").content
        comp_res = vstore.similarity_search(q_res, k=5, filter={"category": {"$ne": "active_tender"}}, namespace=namespace)
        comp_txt = " ".join([d.page_content for d in comp_res])
        
        db = SessionLocal()
        st = db.query(AppSettings).filter(AppSettings.user_id == namespace).first()
        db.close()
        
        prompt = f"Role: Bid Manager at {st.company_name if st else 'Us'}. Tender: {tender_txt}. Our Exp: {comp_txt}. Write proposal."
        
        res = llm.invoke(prompt)
        _log_token_usage(namespace, llm.model, res)
        return res.content

    except Exception as e:
        print(f"❌ Error generando propuesta: {e}")
        return f"Error generando propuesta: {str(e)}"