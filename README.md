# Capture PDF Auto

Extension Chrome / Edge / Brave qui **fait automatiquement une capture d'écran de chaque page d'un PDF** dès que vous l'ouvrez sur internet.

Chaque page est enregistrée en image (PNG ou JPEG) dans votre dossier **Téléchargements** :

```
Téléchargements/Captures-PDF/<site>/<nom-du-pdf>_<date>/page-001.png
                                                       page-002.png
                                                       ...
```

## Installation (2 minutes)

1. Téléchargez ce dépôt (bouton **Code → Download ZIP** sur GitHub) et dézippez-le.
2. Ouvrez `chrome://extensions` (ou `edge://extensions`).
3. Activez le **Mode développeur** (en haut à droite).
4. Cliquez sur **Charger l'extension non empaquetée** et choisissez le dossier `extension`.
5. Épinglez l'icône rouge 📸 dans la barre d'outils.

## Utilisation

- **Automatique** : ouvrez n'importe quel PDF sur internet → les captures se lancent toutes seules. Le badge sur l'icône compte les pages, puis affiche ✓.
- **PDF liés** : cochez *« Capturer aussi les PDF liés dans les pages »* pour capturer tous les PDF liés (liens, iframes) d'une page dès que vous arrivez dessus (20 max par page).
- **Manuel** : boutons *« Capturer le PDF de cet onglet »* et *« Capturer tous les PDF liés dans cette page »* dans la fenêtre de l'extension.

Réglages : qualité (72 / 144 / 216 dpi), format PNG ou JPEG, nombre maximum de pages par PDF.

> Astuce : si Chrome demande où enregistrer chaque fichier, désactivez
> *Paramètres → Téléchargements → « Toujours demander où enregistrer les fichiers »*.

## Bon à savoir

- Le même PDF n'est pas recapturé pendant 5 minutes (anti-doublon). Le bouton manuel force une nouvelle capture.
- Les PDF qui nécessitent une connexion fonctionnent si vous êtes connecté au site dans le navigateur.
- Les PDF locaux (`file://`) ne sont pas capturés automatiquement.
- Le rendu des pages utilise [pdf.js](https://github.com/mozilla/pdf.js) (Mozilla, licence Apache 2.0), inclus dans `extension/lib`.

## Fonctionnement

| Fichier | Rôle |
|---|---|
| `background.js` | Détecte les PDF (en-tête `application/pdf` ou URL en `.pdf`), lance la capture, enregistre les images |
| `offscreen.js` | Télécharge le PDF et dessine chaque page en image avec pdf.js |
| `popup.html/js` | Fenêtre de réglages et historique des captures |

---

# Vidéo → PDF

Appli web (`video-vers-pdf/index.html`) : on dépose la vidéo d'un document qu'on feuillette (enregistrement d'écran, vidéo filmée au téléphone…). L'appli **détecte chaque page**, en fait une **capture nette**, puis crée un **PDF** (ou un ZIP des images).

**Utilisation :** ouvrez `video-vers-pdf/index.html` dans Chrome, Edge ou Firefox (double-clic). Tout se passe sur votre ordinateur, rien n'est envoyé sur internet.

Deux modes :

- **Défilement continu** (par défaut) : pour une vidéo où l'on fait défiler le document. L'appli mesure le défilement entre les images, recolle la vidéo en une longue bande, puis la découpe à chaque **espace entre deux pages**. Une page n'a pas besoin de tenir entière à l'écran.
- **Page par page** : pour une vidéo où l'on saute d'une page à l'autre. Une page est capturée quand l'image reste immobile un instant (environ 0,5 s). C'est le mode le plus fiable si la page entière tient à l'écran.

Étapes :

1. Choisissez la vidéo et le mode.
2. Tracez un rectangle sur la vidéo : la zone où le document défile, **sans les barres d'outils**, en gardant **un peu de fond de chaque côté** des pages (c'est ce fond qui permet de repérer les espaces entre pages).
3. Cliquez sur **Détecter les pages**.
4. Supprimez les captures en trop ou ajoutez une image oubliée (**Ajouter l'image affichée** ; la molette sur la vidéo fait avancer ou reculer).
5. Cliquez sur **Créer le PDF** (ou téléchargez un ZIP des images).

**Conseils :**
- Défilement continu : faites défiler régulièrement, sans à-coups trop rapides. Si des pages sont mal coupées, essayez *Précision : fine*.
- Page par page : si des pages manquent, raccourcissez la *pause minimale* ou augmentez la *sensibilité*.

---

# Détecteur Tradosaure

Appli web (`analyse-tradosaure/index.html`) qui cherche dans vos cours ou vos graphiques les **configurations techniques des 20 modules de la Formation intégrale Tradosaure** et les dessine sur le graphique.

**Utilisation :** ouvrez `analyse-tradosaure/index.html` dans Chrome, Edge ou Firefox (double-clic). Tout est calculé sur votre ordinateur.

Trois façons de donner les données :

- **Valeurs** : collez des lignes `Date;Ouverture;Plus haut;Plus bas;Clôture;Volume` (virgule décimale acceptée), ou une simple liste de clôtures.
- **Fichier** : un export CSV (Boursorama, ABC Bourse, Yahoo, Investing, ProRealTime, TradingView…).
- **Image** : une capture d'écran d'un graphique en chandeliers colorés (ou d'une courbe). Tracez le cadre des bougies, indiquez le prix en haut et en bas du cadre, puis **Extraire** → **Analyser**.

Modules couverts (règles détaillées dans la fiche en bas de l'appli et dans `moteur.js`) :

| Niveau | Modules |
|---|---|
| I – Les essentiels | Bandes de Bollinger, Moyennes mobiles, Ichimoku, Canaux, Triangles, Biseaux, Chandeliers japonais vol. I |
| II – Avancer | Chandeliers japonais vol. II, Stochastique et MACD, Figures d'élargissement, Épaule-Tête-Épaule, Fourchette d'Andrews, Gaps |
| III – Approfondir | Momentum/RSI/CCI, Fibonacci, Turtle Soup revisité, Vague de Wolfe, Système 1-2-3 Dow, Optimiser les sorties, Points pivots |
| Bonus | Doubles sommets/creux, structure de Dow |

Chaque détection donne : sens, force (●○○ à ●●●), explication, et quand c'est pertinent entrée / stop / objectif. Une synthèse donne le biais des dernières barres.

> Les règles sont reconstruites à partir des titres et descriptions publiques des modules et de l'analyse technique classique : les PDF eux-mêmes n'ont pas pu être lus. Pour coller au plus près des ebooks, ajustez les règles dans `analyse-tradosaure/moteur.js` (un détecteur par module). Outil d'aide, pas un conseil en investissement.
