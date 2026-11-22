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

1. Choisissez la vidéo.
2. *(Optionnel)* Tracez un rectangle sur l'image pour ne garder que le document.
3. Cliquez sur **Détecter les pages**.
4. Supprimez les captures en trop ou ajoutez une image oubliée (**Ajouter l'image affichée**, la molette sur la vidéo permet d'avancer ou de reculer).
5. Cliquez sur **Créer le PDF**.

**Conseils :**
- Arrêtez-vous environ 1 seconde sur chaque page pendant l'enregistrement : une page est retenue quand l'image reste immobile assez longtemps.
- Si des pages manquent, raccourcissez la *pause minimale* ou augmentez la *sensibilité*. S'il y a des doublons, faites l'inverse.
- *Ignorer les pages déjà vues* évite les doublons quand on revient en arrière.
