from fastapi import File, UploadFile, FastAPI, Depends, HTTPException, Form
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import List
from datetime import datetime, timezone
import pdfplumber
import io

# --- IMPORTACIONES INTERNAS ---
from app.utils import pdf_parser
from app.db.models import Bid, KnowledgeDocument, AppSettings, TokenUsageLog
from app.db.session import engine, Base, get_db
from app.db import models
from app.core import data_factory
from app.utils.text_processing import clean_text_for_rag
from app.services import ml_service
from app.services import rag_service

# --- SEGURIDAD NUEVA ---
from app.core.security import get_current_user 

# 1. Crear tablas automáticamente
Base.metadata.create_all(bind=engine)

app = FastAPI(title="AutoBid AI API", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# 1. CORE & HEALTH
# ==========================================
@app.get("/")
def read_root():
    return {"status": "AutoBid AI is running 🚀", "mode": "Multi-Tenant Production"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}

# ==========================================
# 2. DATA ENGINEERING & ML
# ==========================================
@app.post("/ml/force-retrain")
def force_retrain(db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    result = ml_service.train_model_from_db(db, user_id=user_id) 
    return result

# ==========================================
# 3. RAG & KNOWLEDGE BASE
# ==========================================

class ChatRequest(BaseModel):
    question: str

@app.post("/rag/chat")
def chat_with_data(request: ChatRequest, user_id: str = Depends(get_current_user)):
    return rag_service.ask_gemini_with_context(request.question, namespace=user_id)

@app.post("/rag/chat/active-tender")
def chat_active_tender(req: ChatRequest, user_id: str = Depends(get_current_user)):
    return {"answer": rag_service.ask_gemini_with_context(req.question, namespace=user_id)}

@app.post("/rag/upload-pdf")
def upload_pdf_knowledge(
    file: UploadFile = File(...), 
    category: str = Form("general"),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user)
): 
    # 1. Extraer texto
    text_content = pdf_parser.extract_text_from_pdf(file)
    
    # 2. Autodetectar categoría
    final_category = category
    if category == "auto":
        try:
            final_category = rag_service.detect_category(text_content, user_id=user_id)
        except:
            final_category = "General"
    
    # 3. Gestión de memoria
    if final_category == "active_tender": 
        rag_service.clear_active_tender(namespace=user_id) 
        pinecone_category = "active_tender"
        pinecone_sub = "input_file"
    else:
        pinecone_category = "company_knowledge"
        pinecone_sub = final_category
    
    # 4. Ingestar en Pinecone
    metadata = {
        "category": pinecone_category,
        "sub_category": pinecone_sub,
        "source_id": file.filename
    }
    rag_service.ingest_text(text_content, metadata, namespace=user_id)
    
    # 5. Guardar registro en SQL (Solo si NO es active_tender)
    if final_category != "active_tender" and category != "active_tender":
        new_doc = KnowledgeDocument(
            user_id=user_id,
            filename=file.filename,
            category=final_category,
            upload_date=datetime.now(timezone.utc)
        )
        db.add(new_doc)
        db.commit()
    
    # 6. ANÁLISIS + PREDICCIÓN ML (AHORA CON 4 ATRIBUTOS)
    analysis_result = None
    if final_category == "active_tender" or category == "active_tender":
        try:
            # A. Extraer datos con LLM (Trae Tech Score y Deadline)
            extracted = rag_service.extract_key_data(text_content, user_id=user_id)
            
            industry = extracted.get("industry", "General")
            budget = extracted.get("budget", 0)
            tech_score = extracted.get("technical_score", 50)
            deadline = extracted.get("deadline", None)
            
            # B. Predecir con ML (Pasamos los nuevos datos)
            prediction_data = ml_service.predict_bid(
                industry, 
                budget, 
                tech_score, 
                deadline, 
                user_id=user_id
            )
            
            final_prob = 50.0
            explanation_data = []

            if prediction_data:
                if isinstance(prediction_data, dict):
                    # El ML service ya devuelve el % multiplicado (ej: 94.0)
                    final_prob = prediction_data.get("probability", 50.0) 
                    explanation_data = prediction_data.get("explanation", [])
                else:
                    final_prob = round(prediction_data * 100, 1)
            
            analysis_result = {
                "detected_industry": industry,
                "detected_budget": budget,
                "win_probability": final_prob,
                "explanation": explanation_data 
            }
        except Exception as e:
            print(f"⚠️ Error analizando tender: {e}")
            analysis_result = {
                "detected_industry": "N/A", "detected_budget": 0, "win_probability": 50.0, "explanation": []
            }

    return {
        "message": "PDF procesado",
        "filename": file.filename,
        "detected_category": final_category,
        "analysis": analysis_result
    }

@app.get("/rag/documents")
def get_documents(db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    docs = db.query(KnowledgeDocument).filter(KnowledgeDocument.user_id == user_id).order_by(KnowledgeDocument.id.desc()).all()
    for doc in docs:
        if doc.upload_date and doc.upload_date.tzinfo is None:
            doc.upload_date = doc.upload_date.replace(tzinfo=timezone.utc)
            
    return docs

# Bulk Update Categories
class BulkCategoryItem(BaseModel):
    id: int
    category: str

class BulkCategoryRequest(BaseModel):
    updates: List[BulkCategoryItem]

@app.put("/rag/documents/bulk-update")
def bulk_update_documents(req: BulkCategoryRequest, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    count = 0
    for item in req.updates:
        doc = db.query(KnowledgeDocument).filter(KnowledgeDocument.id == item.id, KnowledgeDocument.user_id == user_id).first()
        if doc:
            doc.category = item.category
            count += 1
    db.commit()
    return {"message": f"{count} documentos actualizados."}

# Delete Documents
class DeleteDocsRequest(BaseModel):
    ids: List[int]

@app.post("/rag/documents/delete")
def delete_documents(req: DeleteDocsRequest, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    count = 0
    for doc_id in req.ids:
        doc = db.query(KnowledgeDocument).filter(KnowledgeDocument.id == doc_id, KnowledgeDocument.user_id == user_id).first()
        if doc:
            try:
                rag_service.delete_document_by_source(doc.filename, namespace=user_id)
            except Exception as e:
                print(f"Error Pinecone: {e}")
            db.delete(doc)
            count += 1
    db.commit()
    return {"message": f"{count} eliminados."}

@app.post("/rag/generate-proposal")
def generate_proposal(user_id: str = Depends(get_current_user)):
    draft = rag_service.generate_proposal_draft(namespace=user_id)
    return {"draft_text": draft}


# ==========================================
# 4. BIDS & HISTORY MANAGEMENT
# ==========================================
@app.get("/dashboard/stats")
def get_dashboard_stats(db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    base_query = db.query(Bid).filter(Bid.user_id == user_id)
    
    total = base_query.count()
    won = base_query.filter(Bid.status == "WON").count()
    lost = base_query.filter(Bid.status == "LOST").count()
    completed = won + lost
    win_rate = (won / completed * 100) if completed > 0 else 0
    
    won_amt = db.query(func.sum(Bid.budget)).filter(Bid.user_id == user_id, Bid.status == "WON").scalar() or 0
    pipe_amt = db.query(func.sum(Bid.budget)).filter(Bid.user_id == user_id, Bid.status == "PENDING").scalar() or 0

    ind_stats = db.query(Bid.industry, func.count(Bid.id)).filter(Bid.user_id == user_id).group_by(Bid.industry).all()
    charts = [{"name": ind or "Sin definir", "value": c} for ind, c in ind_stats]

    recent = base_query.order_by(Bid.created_at.desc()).limit(5).all()

    return {
        "kpis": {"total_bids": total, "win_rate": round(win_rate, 1), "total_won_amount": won_amt, "pipeline_amount": pipe_amt},
        "charts": {"industry_distribution": charts},
        "recent_activity": recent
    }

@app.post("/history/upload")
async def upload_historical_bid(
    file: UploadFile = File(...), 
    status: str = Form(...), 
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user)
):
    print(f"📥 Intento de subida User {user_id}: {file.filename}")

    file_bytes = await file.read()
    
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="El archivo está vacío.")

    text_content = ""
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                extracted = page.extract_text()
                if extracted:
                    text_content += extracted + "\n"
        
        # 🔥 APLICAR LA LIMPIEZA AQUÍ (FIX) 🔥
        text_content = clean_text_for_rag(text_content)
        print(f"✨ Historial limpiado y aplanado ({len(text_content)} chars)")

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"PDF ilegible: {str(e)}")

    try:
        extracted_data = rag_service.extract_key_data(text_content, user_id=user_id)
        industry = extracted_data.get("industry", "General")
        budget = extracted_data.get("budget", 0.0)
        tech_score = extracted_data.get("technical_score", 50.0)
        deadline_str = extracted_data.get("deadline", None)
        complexity = extracted_data.get("complexity", "Medium")
        
        # Convertir string fecha a objeto datetime
        deadline_dt = None
        if deadline_str:
            try:
                deadline_dt = datetime.strptime(deadline_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            except:
                pass

    except Exception:
        industry = "General"
        budget = 0.0
        tech_score = 50.0
        deadline_dt = None
        complexity = "Medium"

    # Limpieza en Pinecone
    rag_service.delete_document_by_source(file.filename, namespace=user_id)

    # Guardar en SQL con NUEVAS COLUMNAS
    new_bid = Bid(
        user_id=user_id,
        project_name=file.filename.replace(".pdf", "").replace("_", " "),
        client_name="Histórico Importado",
        industry=industry,
        budget=budget,
        status=status,
        content_text=text_content,
        created_at=datetime.now(timezone.utc),
        source_file=file.filename,
        
        # --- CAMPOS NUEVOS ---
        technical_score=tech_score,
        deadline_date=deadline_dt,
        complexity=complexity
    )
    db.add(new_bid)
    db.commit()
    db.refresh(new_bid)

    # Guardar en Pinecone (también va limpio)
    if len(text_content) > 50:
        metadata = {
            "category": "past_bid",      
            "status": status,            
            "industry": industry,
            "source_id": file.filename
        }
        rag_service.ingest_text(text_content, metadata, namespace=user_id)

    # RE-ENTRENAMIENTO DEL MODELO 🧠
    train_result = None
    if status in ["WON", "LOST"]:
        try:
            train_result = ml_service.train_model_from_db(db, user_id=user_id)
        except Exception as e:
            train_result = {"status": "error", "message": str(e)}

    return {
        "message": "Historial guardado exitosamente", 
        "id": new_bid.id,
        "extracted_info": {"industry": industry, "budget": budget, "tech_score": tech_score},
        "ml_training": train_result
    }

@app.get("/bids")
def get_bids(db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    return db.query(Bid).filter(Bid.user_id == user_id).order_by(Bid.id.desc()).all()

class FinalizeRequest(BaseModel):
    title: str
    content: str
    industry: str
    budget: float

@app.post("/bids/finalize")
def finalize_draft(req: FinalizeRequest, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    new_bid = Bid(
        user_id=user_id,
        project_name=req.title, 
        industry=req.industry, 
        budget=req.budget, 
        content_text=req.content, 
        status="PENDING"
    )
    db.add(new_bid)
    db.commit()
    db.refresh(new_bid)
    return {"message": "Guardado en historial", "id": new_bid.id}

@app.delete("/bids/{bid_id}")
def delete_bid(bid_id: int, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    bid = db.query(Bid).filter(Bid.id == bid_id, Bid.user_id == user_id).first()
    if not bid:
        raise HTTPException(status_code=404, detail="Licitación no encontrada")
    
    target_source = bid.source_file if bid.source_file else f"{bid.project_name}.pdf"
    
    try:
        rag_service.delete_document_by_source(target_source, namespace=user_id)
    except Exception as e:
        print(f"⚠️ Error borrando vectores: {e}")

    db.delete(bid)
    db.commit()
    
    return {"message": "Licitación eliminada."}

# ==========================================
# 5. SETTINGS & SYSTEM
# ==========================================

class SettingsModel(BaseModel):
    company_name: str
    company_description: str
    company_website: str | None = None
    ai_tone: str
    ai_creativity: float
    language: str

@app.get("/settings")
def get_settings(db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    settings = db.query(AppSettings).filter(AppSettings.user_id == user_id).first()
    if not settings:
        settings = AppSettings(user_id=user_id)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings

@app.post("/settings")
def update_settings(req: SettingsModel, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    settings = db.query(AppSettings).filter(AppSettings.user_id == user_id).first()
    if not settings:
        settings = AppSettings(user_id=user_id)
        db.add(settings)
    
    settings.company_name = req.company_name
    settings.company_description = req.company_description
    settings.company_website = req.company_website
    settings.ai_tone = req.ai_tone
    settings.ai_creativity = req.ai_creativity
    settings.language = req.language
    
    db.commit()
    return {"message": "Configuración guardada"}

@app.get("/system/stats")
def get_system_stats(db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    bids_count = db.query(Bid).filter(Bid.user_id == user_id).count()
    docs_count = db.query(KnowledgeDocument).filter(KnowledgeDocument.user_id == user_id).count()
    
    total_tokens_used = db.query(func.sum(TokenUsageLog.total_tokens)).filter(TokenUsageLog.user_id == user_id).scalar() or 0
    input_tokens_used = db.query(func.sum(TokenUsageLog.input_tokens)).filter(TokenUsageLog.user_id == user_id).scalar() or 0
    output_tokens_used = db.query(func.sum(TokenUsageLog.output_tokens)).filter(TokenUsageLog.user_id == user_id).scalar() or 0
    
    vectors_estimated = docs_count * 50 

    return {
        "sql_bids": bids_count,
        "sql_docs": docs_count,
        "pinecone_vectors": vectors_estimated,
        "tokens_total": total_tokens_used,
        "tokens_input": input_tokens_used,
        "tokens_output": output_tokens_used
    }

@app.post("/system/purge")
def purge_system(target: str = Form(...), db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    msg = ""
    
    if target in ["vectors", "all"]:
        try:
            rag_service.clear_active_tender(namespace=user_id) 
            msg += "Vectores del usuario purgados. "
        except Exception as e:
            print(f"Error borrando vectores: {e}")

    if target == "all":
        try:
            db.query(Bid).filter(Bid.user_id == user_id).delete()
            db.query(KnowledgeDocument).filter(KnowledgeDocument.user_id == user_id).delete()
            db.commit()
            msg += "Base de datos SQL limpiada."
        except Exception as e:
            db.rollback()
            msg += f"Error SQL: {e}"

    return {"message": msg, "status": "success"}

@app.post("/rag/chat/stream")
async def chat_streaming(request: ChatRequest, user_id: str = Depends(get_current_user)):
    return StreamingResponse(
        rag_service.stream_ask_gemini(request.question, namespace=user_id), 
        media_type="text/plain"
    )

# --- Modelos para actualización masiva de status ---
class BulkUpdateStatusItem(BaseModel):
    id: int
    status: str

class BulkUpdateStatusRequest(BaseModel):
    updates: List[BulkUpdateStatusItem]

@app.put("/bids/bulk-update-status")
def bulk_update_bid_status(
    req: BulkUpdateStatusRequest, 
    db: Session = Depends(get_db), 
    user_id: str = Depends(get_current_user)
):
    updated_count = 0
    for item in req.updates:
        # Buscamos el bid asegurando que sea del usuario
        bid = db.query(Bid).filter(Bid.id == item.id, Bid.user_id == user_id).first()
        if bid:
            bid.status = item.status
            # Al modificarlo, SQLAlchemy actualizará 'updated_at' automáticamente
            updated_count += 1
    
    db.commit()
    # 🔥 MAGIA: Como acabamos de cambiar estados (a WON/LOST),
    # intentamos disparar el re-entrenamiento aquí mismo.
    train_result = None
    try:
        train_result = ml_service.train_model_from_db(db, user_id=user_id)
    except Exception as e:
        print(f"Error en reentrenamiento automático: {e}")

    return {
        "message": f"{updated_count} licitaciones actualizadas.", 
        "ml_training": train_result
    }

# --- Modelo para el request de borrado masivo ---
class DeleteBidsRequest(BaseModel):
    ids: List[int]

@app.post("/bids/delete")
def delete_bids_bulk(
    req: DeleteBidsRequest, 
    db: Session = Depends(get_db), 
    user_id: str = Depends(get_current_user)
):
    deleted_count = 0
    # Iteramos sobre los IDs recibidos
    for bid_id in req.ids:
        bid = db.query(Bid).filter(Bid.id == bid_id, Bid.user_id == user_id).first()
        
        if bid:
            # 1. Limpieza en Pinecone (Vector DB) 🧹
            # Es vital borrar los vectores para que el RAG no alucine con datos viejos
            target_source = bid.source_file if bid.source_file else f"{bid.project_name}.pdf"
            try:
                rag_service.delete_document_by_source(target_source, namespace=user_id)
            except Exception as e:
                print(f"⚠️ Error borrando vectores de {target_source}: {e}")
            
            # 2. Borrado en SQL 🗑️
            db.delete(bid)
            deleted_count += 1

    db.commit()

    # 3. Disparar Re-entrenamiento (Opcional pero recomendado) 🧠
    # Si borramos muchos datos, el modelo debería enterarse
    train_result = None
    try:
        train_result = ml_service.train_model_from_db(db, user_id=user_id)
    except Exception as e:
        print(f"Error re-entrenando tras borrado: {e}")

    return {
        "message": f"{deleted_count} licitaciones eliminadas correctamente.",
        "ml_training": train_result
    }