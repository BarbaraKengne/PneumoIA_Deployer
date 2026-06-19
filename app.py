import os
import io
import json
import base64

from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from PIL import Image
import numpy as np
import joblib

from skimage.feature import hog
from skimage.color import rgb2gray
from skimage.transform import resize

from google import genai
from google.genai import types

app = Flask(__name__)
CORS(app)

# ════════════════════════════════════════════════════
#  MODÈLE — HOG + SVM calibré (predict_proba dispo)
#  Doit correspondre EXACTEMENT au preprocessing du notebook :
#  128x128 -> rgb2gray -> HOG(9, 8x8, 2x2, L2-Hys)
# ════════════════════════════════════════════════════
MODEL_PATH = "hog_svm_model.joblib"
IMAGE_SIZE = (128, 128)

model = joblib.load(MODEL_PATH)

# Le modèle HOG encode NORMAL=0 et PNEUMONIE=1
idx_pneumo = list(model.classes_).index(1)

# ⚠ SÉCURITÉ : ne jamais laisser une clé API en clair dans le code.
# Mets ta clé dans une variable d'environnement et RÉVOQUE l'ancienne
# (elle a déjà été exposée dans le fichier).  export GENAI_API_KEY="..."
_cle = os.environ.get("GENAI_API_KEY", "")
client = genai.Client(api_key=_cle) if _cle else None

# ════════════════════════════════════════════════════
#  PREPROCESSING — identique au notebook HOG + SVM
# ════════════════════════════════════════════════════
def preparer_image(image_pil):
    arr = np.array(image_pil.convert("RGB"))
    arr = resize(arr, IMAGE_SIZE, anti_aliasing=True)
    gray = rgb2gray(arr)
    features = hog(
        gray,
        orientations=9,
        pixels_per_cell=(8, 8),
        cells_per_block=(2, 2),
        block_norm="L2-Hys",
    )
    return features.astype(np.float32).reshape(1, -1)


# ════════════════════════════════════════════════════
#  ROUTE PRÉDICTION — confiance RÉELLE (plus de simulation)
# ════════════════════════════════════════════════════
@app.route("/predire", methods=["POST"])
def predire():
    if "image" not in request.files:
        return jsonify({"erreur": "Aucune image reçue"}), 400

    fichier = request.files["image"]
    image = Image.open(io.BytesIO(fichier.read()))
    features = preparer_image(image)

    proba = model.predict_proba(features)[0]
    prediction = model.predict(features)[0]

    resultat = "PNEUMONIE" if int(prediction) == 1 else "NORMAL"
    # confiance = probabilité de la classe prédite (vraie proba calibrée)
    confiance = round(float(proba.max()) * 100, 1)

    return jsonify({
        "prediction": resultat,
        "confiance": confiance,
        "proba_pneumonie": round(float(proba[idx_pneumo]) * 100, 1),
    })


# ════════════════════════════════════════════════════
#  CHAT GEMINI (inchangé)
# ════════════════════════════════════════════════════
@app.route("/chat", methods=["POST"])
def chat():
    if client is None:
        return jsonify({"reponse": "Chat indisponible : clé GENAI_API_KEY non configurée."}), 200
    data = request.json
    messages = data.get("messages", [])
    prediction = data.get("prediction", "inconnu")
    confiance = data.get("confiance", 0)

    system = f"""Tu es MedAI, un assistant médical chaleureux spécialisé en radiologie pulmonaire.
Tu viens d'analyser une radiographie avec un modèle de machine learning (HOG + SVM).

Résultat de l'analyse :
- Diagnostic : {prediction}
- Niveau de confiance : {confiance}%

TON STYLE :
- Tu es chaleureux, rassurant et bienveillant, comme un soignant qui prend le temps d'expliquer.
- Tu réponds en un petit paragraphe (3 à 5 phrases), jamais de longs pavés.
- Tu utilises 1 ou 2 emojis bien placés pour humaniser (🫁, 🩺, 💙, ✅...), sans en abuser.
- Tu vulgarises sans jargon : un patient doit te comprendre facilement.
- Tu contextualises le résultat : ce que ça veut dire concrètement, et les suites possibles.
- Tu restes calme et positif même quand le diagnostic est une pneumonie, sans minimiser.
- Tu peux poser une question simple pour mieux aider la personne.

RÈGLES IMPORTANTES :
- Rappelle avec douceur que tu es une aide et que seul un médecin peut poser un vrai diagnostic — mais pas à chaque message, juste quand c'est pertinent.
- Tu n'inventes jamais de symptômes ou de traitements précis.
- Tu réponds toujours en français courant et accessible.

Si le diagnostic est NORMAL : tu rassures tout en invitant à rester attentif aux symptômes.
Si le diagnostic est PNEUMONIE : tu expliques calmement et tu encourages à consulter un médecin rapidement."""

    historique = []
    for msg in messages[:-1]:
        role = "user" if msg["role"] == "user" else "model"
        historique.append(types.Content(
            role=role,
            parts=[types.Part(text=msg["content"])]
        ))
    historique.append(types.Content(
        role="user",
        parts=[types.Part(text=messages[-1]["content"])]
    ))

    try:
        reponse = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=historique,
            config=types.GenerateContentConfig(
                system_instruction=system,
                max_output_tokens=500,
                temperature=0.7
            )
        )
        return jsonify({"reponse": reponse.text})
    except Exception as e:
        return jsonify({"reponse": f"Erreur Gemini : {str(e)}"}), 500


# ════════════════════════════════════════════════════
#  PAGES
# ════════════════════════════════════════════════════
@app.route("/stats")
def stats():
    try:
        with open("stats_modele.json", "r", encoding="utf-8") as f:
            donnees = json.load(f)
    except FileNotFoundError:
        donnees = None
    return render_template("stats.html", stats=donnees)


@app.route("/")
def accueil():
    return render_template("accueil.html")


@app.route("/dashboard")
def dashboard():
    return render_template("index.html")


# ════════════════════════════════════════════════════
#  CARTE DE CHALEUR PAR OCCLUSION (adaptée au modèle HOG)
#  On masque des zones et on mesure la chute de proba pneumonie.
# ════════════════════════════════════════════════════
def generer_heatmap_occlusion(image_pil, taille=128, fenetre=24, pas=12):
    base = image_pil.convert("RGB").resize((taille, taille))
    arr = np.array(base)

    p_base = model.predict_proba(preparer_image(base))[0][idx_pneumo]

    importance = np.zeros((taille, taille), dtype=np.float64)
    comptes = np.zeros((taille, taille), dtype=np.float64)

    for y in range(0, taille, pas):
        for x in range(0, taille, pas):
            arr_masque = arr.copy()
            y2 = min(y + fenetre, taille)
            x2 = min(x + fenetre, taille)
            arr_masque[y:y2, x:x2] = 128  # carré gris

            occ = Image.fromarray(arr_masque)
            p_occ = model.predict_proba(preparer_image(occ))[0][idx_pneumo]

            chute = p_base - p_occ
            importance[y:y2, x:x2] += chute
            comptes[y:y2, x:x2] += 1

    comptes[comptes == 0] = 1
    importance /= comptes
    importance = np.clip(importance, 0, None)
    if importance.max() > 0:
        importance /= importance.max()

    affichage = 256
    imp_img = Image.fromarray((importance * 255).astype(np.uint8)).resize(
        (affichage, affichage), Image.BILINEAR
    )
    imp = np.array(imp_img).astype(np.float64) / 255.0

    # Colormap "jet" (bleu -> vert -> rouge)
    r = np.clip(1.5 - np.abs(4 * imp - 3), 0, 1)
    g = np.clip(1.5 - np.abs(4 * imp - 2), 0, 1)
    b = np.clip(1.5 - np.abs(4 * imp - 1), 0, 1)
    couleurs = np.stack([r, g, b], axis=-1)

    fond = np.array(base.resize((affichage, affichage))).astype(np.float64) / 255.0
    alpha = (imp[..., None]) * 0.6
    sortie = fond * (1 - alpha) + couleurs * alpha
    sortie_img = Image.fromarray((sortie * 255).astype(np.uint8))

    tampon = io.BytesIO()
    sortie_img.save(tampon, format="PNG")
    b64 = base64.b64encode(tampon.getvalue()).decode("utf-8")
    return "data:image/png;base64," + b64


@app.route("/heatmap", methods=["POST"])
def heatmap():
    if "image" not in request.files:
        return jsonify({"erreur": "Aucune image reçue"}), 400
    fichier = request.files["image"]
    image = Image.open(io.BytesIO(fichier.read())).convert("RGB")
    try:
        carte = generer_heatmap_occlusion(image)
        return jsonify({"heatmap": carte})
    except Exception as e:
        return jsonify({"erreur": str(e)}), 500


# lancement
if __name__ == "__main__":
    app.run(debug=True, port=5000)
