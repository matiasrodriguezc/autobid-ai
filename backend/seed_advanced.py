# backend/seed_advanced.py
import sys
import os
from dotenv import load_dotenv # <--- NUEVO IMPORT

# --- 1. CARGA FORZADA DE VARIABLES DE ENTORNO ---
# Esto busca el archivo .env y carga las variables para que Pydantic no falle
load_dotenv()

# --- 2. IMPORTACIONES NORMALES ---
from datetime import datetime, timedelta, timezone
from app.db.session import SessionLocal
from app.db.models import Bid

# --- TU ID DE USUARIO ---
USER_ID = "user_37iZ7xFkzLguZcveiz8cW3rrw7R" # <--- ¡RECUERDA PONER TU ID REAL DE CLERK AQUÍ!

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
print("✅ Historial Inyectado. Ahora ve al dashboard y sube un archivo cualquiera para forzar el entrenamiento.")