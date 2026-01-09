# backend/seed_advanced.py
import sys
import os
from dotenv import load_dotenv

# --- 1. CARGA FORZADA DE VARIABLES DE ENTORNO ---
load_dotenv()

# --- 2. IMPORTACIONES ---
from datetime import datetime, timedelta, timezone
# AGREGAMOS 'engine' y 'Base' aquí:
from app.db.session import SessionLocal, engine, Base 
from app.db.models import Bid

# --- 3. CREACIÓN DE TABLAS (LA SOLUCIÓN AL ERROR) ---
print("🏗️  Conectando a Neon y construyendo tablas...")
# Esto lee tus modelos (como Bid) y crea las tablas SQL automáticamente
Base.metadata.create_all(bind=engine)
print("✅  Tablas creadas exitosamente.")

# --- 4. CONFIGURACIÓN DE USUARIO ---
USER_ID = "user_37iZ7xFkzLguZcveiz8cW3rrw7R" 

db = SessionLocal()

print(f"🌱 Sembrando historial avanzado para {USER_ID}...")

# 1. CASOS DE ÉXITO (Alto Match, Buen Tiempo, Presupuesto Normal)
for i in range(5):
    db.add(Bid(
        user_id=USER_ID,
        project_name=f"Proyecto Ganador {i}",
        industry="Technology",
        budget=80000 + (i*5000),
        status="WON",
        technical_score=95.0,
        deadline_date=datetime.now(timezone.utc) + timedelta(days=45),
        created_at=datetime.now(timezone.utc)
    ))

# 2. CASOS PERDIDOS POR "NO ES LO NUESTRO" (Bajo Match)
for i in range(3):
    db.add(Bid(
        user_id=USER_ID,
        project_name=f"Proyecto Construcción {i}",
        industry="Construction",
        budget=500000,
        status="LOST",
        technical_score=10.0,
        deadline_date=datetime.now(timezone.utc) + timedelta(days=60),
        created_at=datetime.now(timezone.utc)
    ))

# 3. CASOS PERDIDOS POR "URGENCIA" (Deadline imposible)
for i in range(3):
    db.add(Bid(
        user_id=USER_ID,
        project_name=f"Proyecto Urgente {i}",
        industry="Technology",
        budget=100000,
        status="LOST",
        technical_score=90.0,
        deadline_date=datetime.now(timezone.utc) + timedelta(days=1),
        created_at=datetime.now(timezone.utc)
    ))

db.commit()
print("✅ Historial Inyectado. Tu base de datos en la nube está lista 🚀.")