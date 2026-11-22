# RSI & Alertes v2 — module pour le classeur « watchlist_auto »

Deux fichiers Apps Script à coller dans ton classeur :

| Fichier | Contenu |
|---|---|
| [`RSI_Alertes.gs`](RSI_Alertes.gs) | Colonnes RSI, onglets Zones_PRT et Mes_positions, contrôle du soir, e-mail, Telegram |
| [`Yahoo_Zones.gs`](Yahoo_Zones.gs) | Données Yahoo Finance (secours), diagnostic des tickers, zones mensuelles v2 |

## Ce que ça fait

1. **Réparations** : *Diagnostic des tickers* trouve le bon ticker des valeurs en erreur et le corrige en un clic. *Zones mensuelles v2* recalcule l'onglet « Zones » (qui affichait « Échec Google Finance ») à partir de l'historique Yahoo.
2. **Alertes sur le téléphone** par Telegram, en plus de l'e-mail.
3. **⭐ Confluence** : zone d'achat ProRealTime atteinte ou proche **+** RSI journalier ≤ 40 **+** prix au-dessus de la MM200. En tête de l'e-mail et du message Telegram.
4. **Sorties de survente / surachat** : alerte le jour où le RSI repasse au-dessus de 30 (ou sous 70).
5. **RSI hebdomadaire** : colonne `RSI (H)` dans la Watchlist, plus une alerte quand il passe en survente / surachat.
6. **Croisements MM50 / MM200** : colonne `MM50 / MM200` (✨ golden cross / ☠️ death cross avec la date) et alerte.
7. **Taille de position et stop** dans `Zones_PRT` : entrée, stop, quantité, montant en € et ratio gain/risque, d'après ton capital et ton risque par trade.
8. **Mes positions** : nouvel onglet pour tes lignes CTO / PEA, avec plus-value en € et alertes stop / objectif / RSI en surachat.

Et toujours : la colonne **RSI (J)**, les **seuils réglables**, l'onglet **Zones_PRT** avec l'alerte à moins de **3 %**, le **contrôle du soir** et le **Journal_alertes**.

## Installation (5 minutes)

1. Ouvre **watchlist_auto** → **Extensions → Apps Script**.
2. **+ → Script**, nomme-le `RSI_Alertes`, colle le contenu de `RSI_Alertes.gs`.
   (Si tu avais déjà collé la première version : remplace tout son contenu.)
3. **+ → Script** encore, nomme-le `Yahoo_Zones`, colle le contenu de `Yahoo_Zones.gs`.
4. **Enregistrer** 💾, choisis la fonction **`installerRsiAlertes`**, puis **Exécuter** → **Autoriser**.
   Google demande d'accepter : modifier le classeur, envoyer des e-mails, lancer des tâches programmées, **se connecter à des services externes** (Yahoo Finance et Telegram).
   Si l'écran « Google n'a pas validé cette application » s'affiche : *Paramètres avancés → Accéder au projet*.
5. Dans le classeur, menu **📊 RSI & Alertes** :
   1. **🩺 Diagnostic des tickers en erreur**, coche les bonnes suggestions, puis **✅ Appliquer les corrections cochées** ;
   2. **🗓️ Recalculer les zones mensuelles (v2, Yahoo)** ;
   3. **📱 Configurer Telegram** (voir ci-dessous) ;
   4. **🔔 Contrôler maintenant** pour tester.

Ton script existant n'est pas touché. Utilise désormais *Zones mensuelles v2* à la place de l'ancien menu *Zones mensuelles › Calculer*.

### Telegram (3 minutes)

1. Dans Telegram, cherche **@BotFather** → envoie `/newbot` → donne un nom → il te renvoie un **jeton**.
2. Menu **📱 Configurer Telegram** → colle le jeton.
3. Ouvre la conversation avec ton robot, appuie sur **Démarrer**, envoie « bonjour », puis clique **OK**. Un message de test arrive.

Le jeton est enregistré dans les propriétés du script, pas dans le classeur.

## Les onglets

### Watchlist : 6 colonnes à droite
`RSI (J)` (live) · `Zone RSI` · `Seuil RSI bas (perso)` · `Seuil RSI haut (perso)` · `RSI (H)` (chaque soir) · `MM50 / MM200` (chaque soir).

### Zones_PRT
Tu saisis (cases jaunes) : **Ticker, Sens (Achat/Vente), Zone basse, Zone haute**, et si tu veux **Seuil perso** et **Objectif**.
Calculé : prix, distance, statut (🔔 approche · 🎯 dans la zone · ⚠️ cassée · 🚀 dépassée), RSI, ⭐, **Entrée** (haut de la zone), **Stop** (bas de la zone − 1 %), **Quantité** (risque 1 % du capital), **Montant €**, **Gain / risque**.
Entrée et Stop sont des propositions : tu peux taper tes propres niveaux par-dessus.

### Mes_positions
Tu saisis : **Compte (CTO/PEA), Ticker, Quantité, PRU**, et si tu veux **Date d'achat, Stop, Objectif**.
Calculé : prix, valeur en €, +/- value en € et en %, distance au stop et à l'objectif, RSI, statut. La ligne 3 affiche les totaux CTO / PEA.
L'onglet Portefeuille de `complete_stock_tracker` est cassé (#REF!), donc rien n'est importé : recopie tes lignes une fois.

### Paramètres (cases jaunes, en bas de l'onglet)
Seuils RSI (30 / 70), période (14), seuil d'approche des zones (3 %), RSI max. de la confluence (40), capital et risque par trade, marge du stop, seuil stop / objectif du portefeuille, réglages des zones mensuelles, heure du contrôle (18 h), e-mail, et activation de chaque type d'alerte (Oui / Non).

## Comment marchent les alertes

- Chaque soir (18 h par défaut), le script télécharge l'historique Yahoo de toutes tes valeurs, met à jour le RSI hebdo et les croisements, puis relit tout le classeur.
- Une alerte n'est envoyée **qu'une fois**, le jour où elle apparaît (🆕). Tant qu'elle dure, elle reste dans le récap de l'e-mail. Telegram ne reçoit que les nouvelles.
- L'e-mail et le message Telegram sont rangés par importance : ⭐ confluences, positions, zones PRT, zones mensuelles, croisements, RSI journalier, RSI hebdo.
- Tout est noté dans **Journal_alertes**.

## Sources de données

- **GOOGLEFINANCE** (déjà utilisé par ta watchlist) : prix, RSI journalier live.
- **Yahoo Finance** : RSI hebdo, croisements, zones mensuelles, et secours quand Google Finance ne connaît pas un ticker. C'est une interface non officielle, gratuite et sans clé. Si Yahoo bloque un soir, le reste continue de marcher.
- **Investing.com** : pas utilisé. Le site n'a pas d'API publique, ses conditions d'utilisation interdisent la récupération automatique et il bloque les robots. Les cotations sont de toute façon les mêmes, puisqu'elles viennent des bourses.

Outil d'aide à la décision, pas un conseil en investissement.
