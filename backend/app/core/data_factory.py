import random
from app.db import models
from sqlalchemy.orm import Session

CLIENTS = ["TechCorp", "Gobierno", "BankOfAmerica", "StartupX", "RetailGiant"]
INDUSTRIES = ["Fintech", "Health", "Government", "E-commerce", "Logistics"]
STACKS = ["Python", "Java", "Node.js", ".NET", "PHP"]

def generate_historical_data(db: Session, n=1000):
    """Genera n licitaciones sintéticas y las guarda en DB"""
    # Limpiar tabla primero (opcional, para no duplicar)
    # db.query(models.Bid).delete() 
    for _ in range(n):
        client = random.choice(CLIENTS)
        industry = random.choice(INDUSTRIES)
        budget = round(random.uniform(5000, 500000), 2)
        stack = random.choice(STACKS)
        # Lógica Secreta ("Ground Truth"): Define quién gana para que el modelo aprenda patrones
        # Regla: Ganamos más en Python/Java y en Fintech. Perdemos en Gobierno con bajo presupuesto.
        score = 0.3 # Base
        if stack in ["Python", "Java"]: score += 0.3
        if industry == "Fintech": score += 0.2
        if industry == "Government" and budget < 20000: score -= 0.4
        # Ruido aleatorio
        score += random.uniform(-0.1, 0.1)
        status = "WON" if score > 0.6 else "LOST"
        # Crear objeto
        bid = models.Bid(
            client_name=client,
            project_name=f"Proyecto {industry} con {stack}",
            industry=industry,
            budget=budget,
            status=status,
            ai_analysis=f"Stack requerido: {stack}. Cliente: {client}" 
        )
        db.add(bid)
    db.commit()
    return {"message": f"{n} registros generados correctamente."}