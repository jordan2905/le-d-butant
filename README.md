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
