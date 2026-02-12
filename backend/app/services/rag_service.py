import os
import json
import re
from typing import List, Dict, Any, Optional

# Librerías de IA y LangChain
from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain_pinecone import PineconeVectorStore
from langchain.prompts import PromptTemplate
from langchain.schema import StrOutputParser
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from app.utils.privacy import sanitize_text

# Base de datos SQL
from app.db.session import SessionLocal
from app.db.models import AppSettings, TokenUsageLog

# Librería Nativa de Pinecone (Solo para limpieza)
from pinecone import Pinecone

# Configuración
from app.core.config import settings


# --- HELPER DE LOGGING (NUEVO) ---
def _log_token_usage(user_id: str, model_name: str, response: Any):
    """Extrae el uso de tokens y lo guarda en la DB."""
    try:
        # 1. Extraer tokens de la respuesta de LangChain/Gemini
        # La estructura puede variar, hay que ser defensivos
        token_info = response.response_metadata.get("token_usage", {})
        if not token_info and "usage_metadata" in response.response_metadata:
             token_info = response.response_metadata.get("usage_metadata", {})

        total_tokens = token_info.get("total_tokens", 0)
        input_tokens = token_info.get("prompt_token_count", 0)
        output_tokens = token_info.get("candidates_token_count", 0)

        if total_tokens > 0:
            # 2. Guardar en la base de datos
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
            print(f"✅ Tokens logueados para {user_id}: {total_tokens} (in: {input_tokens}, out: {output_tokens})")

    except Exception as e:
        print(f"⚠️ Error al loguear tokens: {e}")

# --- 1. CONFIGURACIÓN E INICIALIZACIÓN ---

# A. Embeddings
embeddings = GoogleGenerativeAIEmbeddings(
    model="models/text-embedding-004",
    google_api_key=settings.GOOGLE_API_KEY,
    task_type="retrieval_document" 
)

# B. LLM
llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash", 
    temperature=0.3,
    google_api_key=settings.GOOGLE_API_KEY
)

# C. Configuración de Pinecone
index_name = "autobid-index"

# C.1. Cliente LangChain
vector_store = PineconeVectorStore(
    index_name=index_name,
    embedding=embeddings,
    pinecone_api_key=settings.PINECONE_API_KEY
)

# C.2. Cliente Nativo
pc = Pinecone(api_key=settings.PINECONE_API_KEY)
pc_index = pc.Index(index_name)


# --- 2. FUNCIONES DE GESTIÓN (LIMPIEZA E INGESTA) ---

def clear_active_tender(namespace: str):
    """
    🧹 LA ESCOBA: Borra de la memoria todo lo relacionado con la licitación anterior
    DENTRO del namespace del usuario.
    """
    try:
        # Usamos delete con filtro y especificando namespace
        pc_index.delete(
            filter={"category": "active_tender"},
            namespace=namespace  # <--- CLAVE PARA MULTI-TENANT
        )
        print(f"🧹 Memoria de 'active_tender' limpiada para usuario {namespace}.")
    except Exception as e:
        print(f"⚠️ Error al limpiar active_tender: {e}")

def ingest_text(text: str, metadata: dict, namespace: str):
    """
    Vectoriza y guarda en Pinecone bajo el namespace del usuario.
    Incluye limpieza automática de PII (Datos Personales) para la Base de Conocimiento.
    """
    if not text or len(text.strip()) == 0:
        return {"error": "El PDF está vacío."}

    text = text.replace("\x00", "") 

    # --- NUEVO: CAPA DE SEGURIDAD PII (Microsoft Presidio) ---
    # Lógica: Si estamos subiendo documentos a la "Knowledge Base" (CVs, Historial, Casos),
    # DEBEMOS censurar emails, teléfonos y nombres para cumplir con GDPR/Privacidad.
    # Si es el "active_tender" (el pliego que queremos ganar), lo dejamos crudo 
    # porque a veces necesitamos esos datos de contacto para la propuesta.
    
    is_knowledge_base = metadata.get("category") != "active_tender"
    
    if is_knowledge_base:
        try:
            text = sanitize_text(text)
            print(f"🛡️ PII Redaction aplicado. Texto limpiado de datos sensibles.")
        except Exception as e:
            print(f"⚠️ Advertencia: Falló la limpieza PII, se usará texto original. Error: {e}")
    # ---------------------------------------------------------

    print(f"--- INGESTANDO TEXTO ({len(text)} chars) para User: {namespace} ---")

    try:
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
        chunks = text_splitter.split_text(text)

        docs = [Document(page_content=chunk, metadata=metadata) for chunk in chunks]

        # Guardar en Pinecone ESPECIFICANDO EL NAMESPACE
        ids = vector_store.add_documents(docs, namespace=namespace)
        
        return {"message": "Texto vectorizado y guardado 🧠", "chunks_count": len(ids)}
        
    except Exception as e:
        print(f"Error CRÍTICO en ingest_text: {e}")
        raise e

def delete_document_by_source(filename: str, namespace: str):
    """
    Borra vectores de un archivo específico dentro del namespace del usuario.
    """
    try:
        pc_index.delete(
            filter={"source_id": filename},
            namespace=namespace # <--- CLAVE
        )
        print(f"🗑️ Vectores de '{filename}' eliminados de Pinecone (User: {namespace}).")
        return True
    except Exception as e:
        print(f"⚠️ Error borrando vectores de Pinecone: {e}")
        return False


# --- 3. FUNCIONES DE INTELIGENCIA (DETECTAR, EXTRAER, CHATEAR) ---

def detect_category(text: str, user_id: str) -> str:
    """
    Analiza el inicio del documento (No requiere namespace, es pura lógica LLM).
    """
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
        response = llm.invoke(prompt.format(text_snippet=text[:2000]))
        # --- LOGGING ---
        _log_token_usage(user_id, llm.model, response)
        category = response.content.strip().replace(".", "")
        if category not in ["CV", "Case Study", "Financial", "Technical", "General"]:
            return "General"
        return category
    except Exception:
        return "General"

def extract_key_data(text: str, user_id: str):
    """
    Extrae Presupuesto, Industria, Technical Score y Deadline.
    """
    prompt_template = """
        Act as a B2B Bid Analyst for a Technology/Software Development company.
        Analyze the following tender text and extract key structured data.
        
        CRITICAL EXTRACTION RULES:
        1. Industry: Choose the best fit (Technology, Mining, Retail, Health, Finance, Construction, Other).
        2. Budget: Extract the numeric value in USD. If range, take average. If not found, return 0.
        3. Technical Match Score: Rate from 0 to 100 how well this matches a Software Development company capabilities. 
           - If it requires coding, cloud, app dev, API, AI -> High score (80-100).
           - If it is hardware supply, catering, civil construction, cleaning -> Low score (0-20).
           - If mixed or unclear -> Medium score (40-60).
        4. Deadline: Extract the submission deadline date in format YYYY-MM-DD. If not found, return null.
        5. Complexity: Low, Medium, or High based on requirements.

        Return ONLY raw JSON with these exact keys:
        {{
            "industry": "String",
            "budget": Number,
            "technical_score": Number,
            "deadline": "YYYY-MM-DD" or null,
            "complexity": "String"
        }}

        Text excerpt:
        {text_snippet}
    """
    try:
        prompt = prompt_template.format(text_snippet=text[:5000])
        response = llm.invoke(prompt)
        
        # Loguear uso
        _log_token_usage(user_id, llm.model, response)
        
        clean_json = response.content.replace("```json", "").replace("```", "").strip()
        data = json.loads(clean_json)
        
        # Normalización defensiva
        return {
            "industry": data.get("industry", "Other"),
            "budget": data.get("budget", 0),
            "technical_score": data.get("technical_score", 50),
            "deadline": data.get("deadline", None),
            "complexity": data.get("complexity", "Medium")
        }
    except Exception as e:
        print(f"Error extracting data: {e}")
        return {
            "industry": "Other", "budget": 0, 
            "technical_score": 50, "deadline": None, "complexity": "Medium"
        }

def ask_gemini_with_context(question: str, namespace: str):
    """
    Chat RAG: Busca en active_tender del USUARIO y responde.
    """
    try:
        # 1. Buscar en el namespace del usuario
        docs = vector_store.similarity_search(
            question,
            k=5,
            filter={"category": "active_tender"},
            namespace=namespace # <--- CLAVE
        )
        
        if not docs:
            return {"answer": "No encontré información sobre la licitación activa en tus documentos.", "sources": []}

        # 2. Contexto y Prompt
        context_text = "\n\n".join([d.page_content for d in docs])
        template = """
            Eres AutoBid. Usa el contexto para responder.
            Contexto: {context}
            Pregunta: {question}
            Respuesta:
        """
        prompt = PromptTemplate.from_template(template).format(context=context_text, question=question)
        
        # 3. Invoke LLM and log
        response = llm.invoke(prompt)
        _log_token_usage(namespace, llm.model, response)

        return {"answer": response.content, "sources": ["context_match"]}
        
    except Exception as e:
        print(f"Error Chat: {e}")
        return {"answer": "Error procesando pregunta.", "error": str(e)}

def stream_ask_gemini(question: str, namespace: str):
    """
    Streaming Chat con Namespace.
    """
    try:
        # Buscar en namespace del usuario
        docs = vector_store.similarity_search(
            question, k=5, 
            filter={"category": "active_tender"},
            namespace=namespace
        )
        context_text = "\n\n".join([d.page_content for d in docs]) if docs else "No hay contexto."

        template = """
            Eres AutoBid. Responde usando el contexto.
            Contexto: {context}
            Pregunta: {question}
            Respuesta:
        """
        prompt = PromptTemplate.from_template(template)
        chain = prompt | llm | StrOutputParser()

        # Streaming
        for chunk in chain.stream({"context": context_text, "question": question}):
            yield chunk

    except Exception as e:
        yield f"Error: {str(e)}"

# --- 4. EL GENERADOR DE PROPUESTAS ---
def generate_proposal_draft(namespace: str):
    """
    Genera el borrador INTELIGENTE cruzando demanda (Tender) vs oferta (Company Knowledge).
    """
    print(f"🤖 Generando propuesta para User: {namespace}")

    # 1. Obtener Settings
    db = SessionLocal()
    settings = db.query(AppSettings).filter(AppSettings.user_id == namespace).first()
    db.close()
    
    c_name = settings.company_name if settings else "Nuestra Empresa"
    c_desc = settings.company_description if settings else "Soluciones tecnológicas."
    tone = settings.ai_tone if settings else "formal"
    
    # 2. RAG: TENDER ACTUAL (Lo que piden)
    tender_results = vector_store.similarity_search(
        "objetivos alcance requisitos técnicos entregables", k=6, 
        filter={"category": "active_tender"},
        namespace=namespace
    )
    tender_text = "\n".join([d.page_content for d in tender_results])

    # --- PASO INTELIGENTE: EXTRAER KEYWORDS ---
    keyword_prompt = f"""
    Basado en este texto de licitación:
    "{tender_text[:1000]}..."
    
    Genera una query de búsqueda para encontrar casos de éxito similares o CVs relevantes en una base de datos vectorial.
    Ejemplo: "Proyectos migración nube AWS sector bancario"
    Solo devuelve la query.
    """
    search_query_response = llm.invoke(keyword_prompt)
    dynamic_query = search_query_response.content.strip()
    print(f"🔍 Búsqueda Inteligente: '{dynamic_query}'")

    # 3. RAG: CONOCIMIENTO DE EMPRESA (Lo que tenemos)
    company_results = vector_store.similarity_search(
        dynamic_query,
        k=5,
        filter={"category": {"$ne": "active_tender"}},
        namespace=namespace
    )
    
    company_text = ""
    for doc in company_results:
        doc_type = doc.metadata.get('category', 'General')
        source = doc.metadata.get('source_id', 'Desconocido')
        company_text += f"[{doc_type} - {source}]: {doc.page_content}\n\n"

    if not company_text:
        company_text = "No se encontraron casos de estudio o CVs específicos. Usar experiencia general."

    # 4. Prompt Final (Structured Proposal)
    # MODIFICADO: Instrucciones estrictas de formato para evitar asteriscos en el PDF
    prompt = f"""
    ERES: Bid Manager Senior de la empresa "{c_name}".
    TU MISIÓN: Escribir una propuesta ganadora para el siguiente cliente.
    
    DATOS DE TU EMPRESA:
    "{c_desc}"
    TONO: {tone} (Persuasivo pero profesional)

    --- CONTEXTO DEL CLIENTE (TENDER) ---
    {tender_text}
    -------------------------------------

    --- NUESTRA EXPERIENCIA DEMOSTRABLE (RAG) ---
    {company_text}
    ---------------------------------------------

    INSTRUCCIONES DE FORMATO (CRÍTICO):
    - NO uses asteriscos dobles (**) para negritas. El sistema de PDF no los soporta.
    - NO uses Markdown para resaltar palabras dentro de un párrafo. Escribe en texto plano limpio.
    - Usa '#' solamente para los Títulos de las secciones (Ej: # 1. Resumen Ejecutivo).
    - Usa '-' para las listas de viñetas.
    - El texto debe estar listo para ser impreso formalmente sin símbolos de formato extraños.

    ESTRUCTURA DEL BORRADOR:
    # 1. Resumen Ejecutivo
    (Gancho inicial. Menciona 1 caso de éxito similar si hay en el contexto).
    
    # 2. Entendimiento del Problema
    (Demuestra que leímos el pliego).
    
    # 3. Nuestra Solución
    (Enfoque técnico/metodológico).
    
    # 4. Por qué {c_name}
    (Menciona experiencia específica encontrada en el contexto. NO inventes).
    
    # 5. Plan de Trabajo
    (Fases macro estimadas).

    Genera el contenido ahora:
    """

    response = llm.invoke(prompt)
    _log_token_usage(namespace, llm.model, response)
    
    return response.content

def extract_and_store_company_profile(text: str):
    pass