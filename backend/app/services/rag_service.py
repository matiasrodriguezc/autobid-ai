import os
import json
import re
from typing import List, Dict, Any, Optional

# Librerías de IA y LangChain
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_pinecone import PineconeVectorStore
from langchain.prompts import PromptTemplate
from langchain.schema import StrOutputParser
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from langchain_community.embeddings import HuggingFaceEmbeddings # Modelo Local
from app.utils.privacy import sanitize_text

# Base de datos SQL
from app.db.session import SessionLocal
from app.db.models import AppSettings, TokenUsageLog

# Librería Nativa de Pinecone
from pinecone import Pinecone

# Configuración
from app.core.config import settings
from google.api_core import client_options as client_options_lib

# --- VARIABLES GLOBALES (LAZY LOADING) ---
# No inicializamos nada aquí para que el servidor arranque rápido.
_embeddings = None
_vector_store = None
_pc_index = None
_llm = None

index_name = "autobid-index"

# --- HELPER DE LOGGING ---
def _log_token_usage(user_id: str, model_name: str, response: Any):
    try:
        token_info = response.response_metadata.get("token_usage", {})
        if not token_info and "usage_metadata" in response.response_metadata:
             token_info = response.response_metadata.get("usage_metadata", {})

        total_tokens = token_info.get("total_tokens", 0)
        input_tokens = token_info.get("prompt_token_count", 0)
        output_tokens = token_info.get("candidates_token_count", 0)

        if total_tokens > 0:
            db = SessionLocal()
            log_entry = TokenUsageLog(
                user_id=user_id,
                model_name=model_name,
                total_tokens=total_tokens,
                input_tokens=input_tokens,
                output_tokens=output_tokens
            )
            db.add(log_entry)
            db.commit()
            db.close()
            print(f"✅ Tokens logueados para {user_id}: {total_tokens}")
    except Exception as e:
        print(f"⚠️ Error al loguear tokens: {e}")

# --- SINGLETONS (CARGADORES) ---
def get_embeddings():
    """Carga el modelo solo cuando se necesita."""
    global _embeddings
    if _embeddings is None:
        print("🧠 Cargando modelo de Embeddings Local (all-MiniLM-L6-v2)...")
        _embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
        print("✅ Modelo cargado.")
    return _embeddings

def get_vector_store():
    """Conecta con Pinecone solo cuando se necesita."""
    global _vector_store
    if _vector_store is None:
        _vector_store = PineconeVectorStore(
            index_name=index_name,
            embedding=get_embeddings(), # Llama al cargador
            pinecone_api_key=settings.PINECONE_API_KEY
        )
    return _vector_store

def get_pc_index():
    """Cliente nativo de Pinecone."""
    global _pc_index
    if _pc_index is None:
        pc = Pinecone(api_key=settings.PINECONE_API_KEY)
        _pc_index = pc.Index(index_name)
    return _pc_index

def get_llm():
    """Cliente Gemini."""
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
        print(f"🧹 Memoria de 'active_tender' limpiada para usuario {namespace}.")
    except Exception as e:
        print(f"⚠️ Error al limpiar active_tender: {e}")

def ingest_text(text: str, metadata: dict, namespace: str):
    if not text or len(text.strip()) == 0:
        return {"error": "El PDF está vacío."}
    
    text = text.replace("\x00", "")
    is_knowledge_base = metadata.get("category") != "active_tender"
    
    if is_knowledge_base:
        try:
            text = sanitize_text(text)
            print(f"🛡️ PII Redaction aplicado.")
        except Exception as e:
            print(f"⚠️ Falló la limpieza PII: {e}")

    print(f"--- INGESTANDO TEXTO ({len(text)} chars) para User: {namespace} ---")
    try:
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
        chunks = text_splitter.split_text(text)
        docs = [Document(page_content=chunk, metadata=metadata) for chunk in chunks]
        
        # Usamos el getter Lazy
        vstore = get_vector_store()
        ids = vstore.add_documents(docs, namespace=namespace)
        
        return {"message": "Texto vectorizado y guardado 🧠", "chunks_count": len(ids)}
    except Exception as e:
        print(f"Error CRÍTICO en ingest_text: {e}")
        raise e

def delete_document_by_source(filename: str, namespace: str):
    try:
        idx = get_pc_index()
        idx.delete(filter={"source_id": filename}, namespace=namespace)
        print(f"🗑️ Eliminado {filename} (User: {namespace}).")
        return True
    except Exception as e:
        print(f"⚠️ Error borrando: {e}")
        return False

def detect_category(text: str, user_id: str) -> str:
    prompt = """
        Analiza el siguiente fragmento de texto. Clasifícalo en UNA categoría:
        - CV
        - Case Study
        - Financial
        - Technical
        - General
        Responde SOLO la palabra.
        Texto: {text_snippet}
    """
    try:
        llm = get_llm()
        response = llm.invoke(prompt.format(text_snippet=text[:2000]))
        _log_token_usage(user_id, llm.model, response)
        category = response.content.strip().replace(".", "")
        if category not in ["CV", "Case Study", "Financial", "Technical", "General"]:
            return "General"
        return category
    except Exception:
        return "General"

def extract_key_data(text: str, user_id: str):
    prompt_template = """
        Act as a B2B Bid Analyst. Analyze text and extract:
        1. Industry
        2. Budget (USD number)
        3. Technical Match Score (0-100)
        4. Deadline (YYYY-MM-DD)
        5. Complexity (Low/Medium/High)
        
        Return ONLY raw JSON:
        {{
            "industry": "String",
            "budget": Number,
            "technical_score": Number,
            "deadline": "YYYY-MM-DD" or null,
            "complexity": "String"
        }}
        Text: {text_snippet}
    """
    try:
        llm = get_llm()
        response = llm.invoke(prompt_template.format(text_snippet=text[:5000]))
        _log_token_usage(user_id, llm.model, response)
        
        clean_json = response.content.replace("```json", "").replace("```", "").strip()
        data = json.loads(clean_json)
        return {
            "industry": data.get("industry", "Other"),
            "budget": data.get("budget", 0),
            "technical_score": data.get("technical_score", 50),
            "deadline": data.get("deadline", None),
            "complexity": data.get("complexity", "Medium")
        }
    except Exception as e:
        print(f"Error extracting data: {e}")
        return {"industry": "Other", "budget": 0, "technical_score": 50, "deadline": None, "complexity": "Medium"}

def ask_gemini_with_context(question: str, namespace: str):
    try:
        vstore = get_vector_store()
        docs = vstore.similarity_search(question, k=5, filter={"category": "active_tender"}, namespace=namespace)
        
        if not docs:
            return {"answer": "No encontré información en tus documentos.", "sources": []}

        context_text = "\n\n".join([d.page_content for d in docs])
        template = "Contexto: {context}\nPregunta: {question}\nRespuesta:"
        prompt = PromptTemplate.from_template(template).format(context=context_text, question=question)
        
        llm = get_llm()
        response = llm.invoke(prompt)
        _log_token_usage(namespace, llm.model, response)

        return {"answer": response.content, "sources": ["context_match"]}
    except Exception as e:
        print(f"Error Chat: {e}")
        return {"answer": "Error procesando pregunta.", "error": str(e)}

def stream_ask_gemini(question: str, namespace: str):
    try:
        vstore = get_vector_store()
        docs = vstore.similarity_search(question, k=5, filter={"category": "active_tender"}, namespace=namespace)
        context_text = "\n\n".join([d.page_content for d in docs]) if docs else "No hay contexto."

        template = "Contexto: {context}\nPregunta: {question}\nRespuesta:"
        prompt = PromptTemplate.from_template(template)
        
        llm = get_llm()
        chain = prompt | llm | StrOutputParser()

        for chunk in chain.stream({"context": context_text, "question": question}):
            yield chunk
    except Exception as e:
        yield f"Error: {str(e)}"

def generate_proposal_draft(namespace: str):
    print(f"🤖 Generando propuesta para User: {namespace}")
    db = SessionLocal()
    settings = db.query(AppSettings).filter(AppSettings.user_id == namespace).first()
    db.close()
    
    c_name = settings.company_name if settings else "Nuestra Empresa"
    c_desc = settings.company_description if settings else "Soluciones tecnológicas."
    tone = settings.ai_tone if settings else "formal"
    
    vstore = get_vector_store()
    llm = get_llm()

    tender_results = vstore.similarity_search("objetivos alcance requisitos", k=6, filter={"category": "active_tender"}, namespace=namespace)
    tender_text = "\n".join([d.page_content for d in tender_results])

    keyword_prompt = f"Basado en: '{tender_text[:1000]}...'\nGenera query de búsqueda para casos de éxito similares."
    search_query_response = llm.invoke(keyword_prompt)
    dynamic_query = search_query_response.content.strip()
    
    company_results = vstore.similarity_search(dynamic_query, k=5, filter={"category": {"$ne": "active_tender"}}, namespace=namespace)
    company_text = "".join([f"[{d.metadata.get('category') or 'Gen'}]: {d.page_content}\n" for d in company_results]) or "Usa experiencia general."

    prompt = f"""
    ERES: Bid Manager de "{c_name}".
    DESC: "{c_desc}"
    TONO: {tone}
    
    CLIENTE: {tender_text}
    NOSOTROS: {company_text}

    FORMATO: Texto plano limpio. Solo # para Títulos. Sin ** ni markdown raro.
    
    ESTRUCTURA:
    # 1. Resumen Ejecutivo
    # 2. Entendimiento
    # 3. Solución
    # 4. Por qué {c_name}
    # 5. Plan
    """
    
    response = llm.invoke(prompt)
    _log_token_usage(namespace, llm.model, response)
    return response.content