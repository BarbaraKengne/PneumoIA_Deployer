# 🫁 PneumoIA

Détection de pneumonie sur radiographies thoraciques, avec score de confiance, carte de chaleur explicable et assistant IA.

Projet d'équipe réalisé en 2026 dans le cadre de la Licence 3 Informatique, Aix-Marseille Université (mai – juillet 2026).


> ⚠️ PneumoIA est un projet pédagogique. C'est un outil d'aide, pas un dispositif médical : il ne remplace en aucun cas un diagnostic médical.

---

## Ce que fait l'application

L'utilisateur dépose une radiographie pulmonaire (ou plusieurs, pour une analyse par lot). L'application :

1. prédit **NORMAL** ou **PNEUMONIE** avec un score de confiance ;
2. génère une **carte de chaleur par occlusion** qui montre les zones ayant le plus influencé la décision ;
3. produit un **rapport PDF** téléchargeable ;
4. propose un **assistant IA (MedAI)** qui explique le résultat de façon pédagogique, via une API d'IA générative.

## Méthode

| Étape | Détail |
|---|---|
| Données | Dataset Kaggle *Chest X-Ray Images (Pneumonia)* : 5 856 images (1 583 NORMAL, 4 273 PNEUMONIA) |
| Rééquilibrage | Sous-échantillonnage pour obtenir des classes équilibrées, puis découpage aléatoire 80 / 10 / 10 : 2 532 images d'entraînement, 316 de validation, 318 de test |
| Prétraitement | Niveaux de gris, redimensionnement 128 × 128 |
| Caractéristiques | HOG (Histogram of Oriented Gradients) : 8 100 caractéristiques par image |
| Modèle | `StandardScaler` + `LinearSVC` (C = 0.05, `class_weight="balanced"`) calibré avec `CalibratedClassifierCV` (cv = 5) pour obtenir un score de confiance |
| Explicabilité | Carte de chaleur par occlusion : un carré gris glisse sur l'image, et la chute de probabilité mesure l'importance de chaque zone |

Le HOG a été retenu après avoir abandonné une première approche (HistGradientBoosting sur les pixels en couleur). D'autres modèles ont été comparés et écartés (Random Forest, SVC à noyau RBF, Régression Logistique, Arbre de décision, Naive Bayes, Perceptron, VotingClassifier). Un CNN et un ResNet50 (transfer learning) ont été explorés mais non entraînés faute de GPU.

## Résultats

Évalués sur **318 images de test** (159 NORMAL, 159 PNEUMONIA) :

| | Précision | Rappel | F1 |
|---|---|---|---|
| NORMAL | 91,4 % | 93,7 % | 92,5 % |
| PNEUMONIE | 93,5 % | 91,2 % | 92,4 % |

**Accuracy globale : 92,45 %**

Matrice de confusion :

| | Prédit NORMAL | Prédit PNEUMONIE |
|---|---|---|
| **Réel NORMAL** | 149 | 10 |
| **Réel PNEUMONIE** | 14 | 145 |

Les 14 faux négatifs (pneumonies non détectées) sont les erreurs les plus graves en contexte médical.

## Limites

- **Découpage des données :** les images du dataset Kaggle ont été regroupées puis redécoupées aléatoirement. Plusieurs radios d'un même patient peuvent donc se trouver à la fois dans l'entraînement et dans le test, ce qui peut rendre la précision réelle plus basse que celle annoncée. Le modèle n'a pas encore été évalué sur le jeu de test d'origine de Kaggle.
- **Faux négatifs :** 14 pneumonies manquées sur 159 (environ 9 %).
- **Sensibilité à des éléments non médicaux :** contraste, position du patient ou qualité de l'image peuvent influencer la prédiction.
- **Sous-échantillonnage :** le rééquilibrage écarte une partie des images de pneumonie.


## Installation

### 1. Télécharger le dataset

Le dataset est trop volumineux pour ce dépôt. Télécharge-le sur Kaggle : <https://www.kaggle.com/datasets/paultimothymooney/chest-xray-pneumonia>

Décompresse-le pour obtenir cette structure :

```
PneumoIA/
├── archive/
│   └── chest_xray/
│       ├── train/
│       └── test/
├── app.py
├── hog-svm-balanced-dataset.ipynb
└── ...
```

### 2. Installer les dépendances

```bash
pip install flask flask-cors pillow numpy joblib scikit-learn scikit-image google-genai python-dotenv
```

### 3. Entraîner le modèle

Lance le notebook `hog-svm-balanced-dataset.ipynb`. Il crée le dataset rééquilibré, extrait les caractéristiques HOG (environ 22 minutes, une seule fois), entraîne le SVM (environ 1 minute) et enregistre `hog_svm_model.joblib`.

### 4. Configurer l'assistant IA

Crée un fichier `.env` à la racine avec ta clé d'API : [À VÉRIFIER : nom exact de la variable utilisée dans `app.py`].

### 5. Lancer l'application

```bash
python app.py
```

Ouvre ensuite <http://127.0.0.1:5000> dans ton navigateur.

## Technologies

Python · scikit-learn · scikit-image · Flask · HTML / CSS / JavaScript · joblib · API d'IA générative

## Pistes d'amélioration

- Évaluer le modèle sur le jeu de test d'origine de Kaggle, avec un découpage par patient
- Entraîner un CNN / ResNet50 sur GPU et comparer avec HOG + SVM
- Carte de chaleur plus fine avec Grad-CAM
- Envoi du rapport PDF par e-mail
- Extension à d'autres pathologies pulmonaires
