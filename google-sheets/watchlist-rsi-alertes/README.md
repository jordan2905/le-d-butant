# RSI & Alertes — module pour le classeur « watchlist_auto »

Ajoute à ta watchlist Google Sheets :

- **une colonne RSI journalier** (RSI de Wilder sur 14 séances, le même calcul que ProRealTime) pour chaque valeur ;
- **des alertes RSI** avec des seuils que tu règles toi-même (30 / 70 par défaut), pour toute la liste ou valeur par valeur ;
- **un onglet `Zones_PRT`** où tu recopies tes zones ProRealTime, avec une alerte quand le prix arrive **à moins de 3 %** (réglable) ;
- **un contrôle automatique chaque soir** (18 h par défaut), avec un **e-mail récapitulatif** et un **journal** des alertes.

## Installation (5 minutes, une seule fois)

1. Ouvre le classeur **watchlist_auto** → menu **Extensions → Apps Script**.
2. À gauche, clique sur **+ → Script** et nomme le fichier `RSI_Alertes`.
3. Efface le contenu vide, colle tout le contenu de [`RSI_Alertes.gs`](RSI_Alertes.gs), puis **Enregistrer** (💾).
4. En haut, choisis la fonction **`installerRsiAlertes`** puis **Exécuter**.
5. Google demande une autorisation (lire et modifier le classeur, envoyer des e-mails en ton nom, lancer des tâches programmées) : **Autoriser**.
   Si un écran « Google n'a pas validé cette application » apparaît : *Paramètres avancés → Accéder au projet*. C'est ton propre script.
6. Reviens dans le classeur : un menu **📊 RSI & Alertes** apparaît, et les nouvelles colonnes sont à droite de la Watchlist.

Ton script existant (menu « Zones mensuelles ») n'est pas touché : ce fichier n'a pas de fonction `onOpen`.

## Ce qui est ajouté

### Watchlist : 4 colonnes à droite

| Colonne | Contenu |
|---|---|
| **RSI (J)** | RSI journalier, recalculé automatiquement (clôtures GOOGLEFINANCE plus le cours actuel) |
| **Zone RSI** | 🟢 Survente / 🔴 Surachat selon tes seuils |
| **Seuil RSI bas (perso)** | Vide = seuil global. Ex. 25 pour une valeur très volatile |
| **Seuil RSI haut (perso)** | Vide = seuil global |

### Onglet `Zones_PRT` : tes zones ProRealTime

Tu remplis : **Ticker** (format Google Finance, ex. `EPA:MC`), **Sens** (Achat = zone sous le prix, Vente = zone au-dessus), **Zone basse** et **Zone haute**. Si tu ne mets qu'une valeur, c'est une ligne de prix.
Le prix, la distance, le statut et le RSI se calculent seuls :

- 🔔 **Approche** : à moins du seuil (3 %) de la zone
- 🎯 **Dans la zone**
- ⚠️ **Zone cassée** (le prix est passé sous une zone d'achat) / 🚀 **Zone dépassée** (le prix est passé au-dessus d'une zone de vente)

Le **Seuil perso** remplace les 3 % pour une zone. La case **Pause 🔕** coupe l'alerte d'une zone.

### Onglet Paramètres : nouveaux réglages (cases jaunes)

| Paramètre | Défaut |
|---|---|
| RSI - Période | 14 |
| RSI - Seuil bas (survente) | 30 |
| RSI - Seuil haut (surachat) | 70 |
| Zones PRT - Seuil d'approche | 3 % |
| Alerte - Heure du contrôle | 18 (après la clôture de Paris à 17 h 30) |
| Alerte - E-mail | vide = ton adresse Google |
| Alerte - E-mail même sans nouveauté | Non |
| Alerte - Contrôle le week-end | Non |

Après avoir changé l'heure : menu **📊 RSI & Alertes → Activer l'alerte quotidienne**.

## Comment marchent les alertes

- Chaque soir, le script relit le RSI et les zones de toutes les valeurs.
- Une alerte n'est envoyée **qu'une fois**, le jour où elle apparaît (🆕 dans l'e-mail). Tant que la condition dure, elle reste listée dans le récap sans être renvoyée comme nouvelle. Si elle disparaît puis revient, elle est de nouveau signalée.
- Chaque nouvelle alerte est notée dans l'onglet **Journal_alertes**.
- **🔔 Contrôler maintenant** lance le contrôle tout de suite, pour tester.

## Bon à savoir

- Les données viennent de GOOGLEFINANCE, déjà utilisé par ta watchlist (gratuit, différé d'environ 20 min). Le RSI du soir peut différer de quelques dixièmes de celui de ProRealTime, surtout pour les valeurs américaines à 18 h, encore en séance.
- Les 10 tickers « en erreur » du Dashboard n'auront pas de RSI (affiché `n/d`) tant que leur ticker n'est pas corrigé.
- Si tu ajoutes des valeurs ou si tu régénères la Watchlist : menu **📊 RSI & Alertes → Mettre à jour les colonnes RSI**.
- Outil d'aide à la décision, pas un conseil en investissement.
