import os
import joblib
import pandas as pd
import numpy as np
import shap
from datetime import datetime
from sqlalchemy import desc
from sqlalchemy.orm import Session
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline

from app.db.models import Bid, MLModelLog

# --- CONFIGURACIÓN DE RUTAS DINÁMICAS ---
MODEL_DIR = "app/models_storage"
os.makedirs(MODEL_DIR, exist_ok=True)

def get_model_path(user_id: str):
    return os.path.join(MODEL_DIR, f"model_{user_id}.pkl")

def get_columns_path(user_id: str):
    return os.path.join(MODEL_DIR, f"model_{user_id}_columns.pkl")


def train_model_from_db(db: Session, user_id: str):
    print(f"🧠 ML Service: Entrenando modelo AVANZADO (4 Atributos) para {user_id}...")

    # 1. Obtener datos DEL USUARIO
    bids = db.query(Bid).filter(
        Bid.user_id == user_id,
        Bid.status.in_(["WON", "LOST"])
    ).all()

    if len(bids) < 5:
        return {"status": "skipped", "reason": "Insuficientes datos (<5)."}

    data = []
    for bid in bids:
        # --- CALCULO DE URGENCIA (Días hasta deadline) ---
        days_deadline = 30 # Valor neutro por defecto
        if bid.deadline_date and bid.created_at:
            try:
                # Si deadline < created_at (ya pasó), ponemos 0
                delta = (bid.deadline_date - bid.created_at).days
                days_deadline = max(0, delta)
            except:
                pass

        data.append({
            "industry": bid.industry or "Other",
            "budget": bid.budget or 0,
            "technical_score": bid.technical_score or 50, # Nuevo atributo
            "days_deadline": days_deadline,               # Nuevo atributo
            "result": 1 if bid.status == "WON" else 0
        })
    
    df = pd.DataFrame(data)
    
    # Definimos Features (X) y Target (y)
    X = df[["industry", "budget", "technical_score", "days_deadline"]]
    y = df["result"]
    
    # 2. Pipeline Actualizado
    categorical_features = ['industry']
    numerical_features = ['budget', 'technical_score', 'days_deadline']

    preprocessor = ColumnTransformer(
        transformers=[
            ('cat', OneHotEncoder(handle_unknown='ignore', sparse_output=False), categorical_features), 
            ('num', StandardScaler(), numerical_features)
        ]
    )
    
    pipeline = Pipeline(steps=[
        ('preprocessor', preprocessor),
        ('classifier', RandomForestClassifier(n_estimators=100, random_state=42))
    ])
    
    try:
        pipeline.fit(X, y)
        
        # Guardamos
        joblib.dump(pipeline, get_model_path(user_id))
        
        # Guardamos nombres de columnas para SHAP
        ohe = pipeline.named_steps['preprocessor'].named_transformers_['cat']
        cat_names = ohe.get_feature_names_out(categorical_features)
        feature_names = list(cat_names) + numerical_features
        joblib.dump(feature_names, get_columns_path(user_id))
        
        print(f"✅ Modelo entrenado con {len(df)} registros.")
        return {"status": "trained", "total_samples": len(df)}
        
    except Exception as e:
        print(f"❌ Error guardando modelo: {e}")
        return {"status": "error", "reason": str(e)}


def predict_bid(industry: str, budget: float, tech_score: float, deadline_str: str, user_id: str):
    model_path = get_model_path(user_id)
    columns_path = get_columns_path(user_id)

    if not os.path.exists(model_path):
        return {"probability": 50.0, "explanation": []}

    try:
        pipeline = joblib.load(model_path)
        
        # Calculamos días desde HOY hasta el Deadline
        days_deadline = 30 # Default
        if deadline_str:
            try:
                dt_deadline = datetime.strptime(deadline_str, "%Y-%m-%d")
                delta = (dt_deadline - datetime.now()).days
                days_deadline = max(0, delta)
            except:
                pass

        # DataFrame de entrada con 4 columnas
        input_df = pd.DataFrame([{
            "industry": industry, 
            "budget": budget,
            "technical_score": tech_score,
            "days_deadline": days_deadline
        }])
        
        # 1. Probabilidad
        probs = pipeline.predict_proba(input_df)
        win_prob = probs[0][1] 

        # 2. Explicación (SHAP)
        explanation = []
        try:
            preprocessor = pipeline.named_steps['preprocessor']
            classifier = pipeline.named_steps['classifier']
            
            X_transformed = preprocessor.transform(input_df)
            
            if os.path.exists(columns_path):
                feature_names = joblib.load(columns_path)
            else:
                feature_names = [f"Feature {i}" for i in range(X_transformed.shape[1])]

            explainer = shap.TreeExplainer(classifier)
            shap_values = explainer.shap_values(X_transformed)
            
            if isinstance(shap_values, list):
                shap_val = shap_values[1][0] 
            else:
                shap_val = shap_values[0, :, 1] if len(shap_values.shape) == 3 else shap_values[0]

            input_values = X_transformed[0] if isinstance(X_transformed, np.ndarray) else X_transformed.toarray()[0]

            for name, value, input_val in zip(feature_names, shap_val, input_values):
                if "industry_" in name and input_val == 0: continue

                if abs(value) > 0.001:
                    impact = "Positivo" if value > 0 else "Negativo"
                    # Nombres amigables para el Front
                    clean_name = name.replace("cat__", "").replace("num__", "")
                    if "budget" in clean_name: clean_name = "Presupuesto"
                    if "technical_score" in clean_name: clean_name = "Match Técnico"
                    if "days_deadline" in clean_name: clean_name = "Urgencia (Días)"

                    explanation.append({
                        "feature": clean_name,
                        "impact_value": abs(round(value, 4)),
                        "direction": impact
                    })
            
            explanation.sort(key=lambda x: x['impact_value'], reverse=True)

        except Exception as e:
            print(f"⚠️ Warning SHAP: {e}")

        return {
            "probability": round(win_prob * 100, 1), # Ya multiplicado por 100
            "explanation": explanation
        }

    except Exception as e:
        print(f"Error prediciendo: {e}")
        return {"probability": 50.0, "explanation": []}