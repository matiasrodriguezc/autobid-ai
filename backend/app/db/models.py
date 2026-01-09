from sqlalchemy import Column, Integer, String, Text, Float, DateTime
from sqlalchemy.sql import func
from app.db.session import Base
from datetime import datetime, timezone

# 1. TABLA DE LICITACIONES (ACTIVAS E HISTÓRICAS)
class Bid(Base):
    __tablename__ = "bids"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True, nullable=False) 
    project_name = Column(String, index=True)
    client_name = Column(String, default="Cliente Desconocido")
    industry = Column(String, nullable=True)
    budget = Column(Float, default=0.0)
    status = Column(String, default="PENDING")
    source_file = Column(String, nullable=True) 
    content_text = Column(Text, nullable=True) 
    technical_score = Column(Float, default=0.0) # 0 a 100
    complexity = Column(String, default="Medium") # Low, Medium, High
    deadline_date = Column(DateTime(timezone=True), nullable=True) # Para calcular urgencia
    client_type = Column(String, default="Private") # Public, Private, etc.
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    win_probability = Column(Float, default=0.0)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

# 2. TABLA DE DOCUMENTOS RAG (BIBLIOTECA)
class KnowledgeDocument(Base):
    __tablename__ = "knowledge_documents"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True, nullable=False)
    filename = Column(String)
    # Categoría: "active_tender", "Technical", "CV", "Case Study"
    category = Column(String) 
    upload_date = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


# 3. TABLA DE CONFIGURACIÓN (IDENTIDAD DE LA EMPRESA)
class AppSettings(Base):
    __tablename__ = "app_settings"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True, nullable=False)
    company_name = Column(String, default="Mi Empresa S.A.")
    company_description = Column(String, default="Somos expertos en innovación tecnológica.")
    company_website = Column(String, nullable=True)
    ai_tone = Column(String, default="formal") # formal, persuasive, technical
    ai_creativity = Column(Float, default=0.3) # 0.0 a 1.0
    language = Column(String, default="es-latam")

# 4. TABLA DE LOGS DE USO DE TOKENS
class TokenUsageLog(Base):
    __tablename__ = "token_usage_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True, nullable=False)
    model_name = Column(String, nullable=False)
    total_tokens = Column(Integer, nullable=False)
    # Nota: Langchain para Gemini no desglosa input/output, guardamos solo total.
    input_tokens = Column(Integer, nullable=False)
    output_tokens = Column(Integer, nullable=False)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

# 5. TABLA DE LOGS DE ENTRENAMIENTO DE MODELOS ML
class MLModelLog(Base):
    __tablename__ = "ml_model_logs"
    id = Column(Integer, primary_key=True, index=True)
    trained_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)) # Cuándo se entrenó
    rows_used = Column(Integer)
    status = Column(String)