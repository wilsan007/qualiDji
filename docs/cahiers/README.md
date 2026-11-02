# Cahiers d'utilisation QualiDji

Trois cahiers, un par profil, rédigés **écran par écran, bouton par bouton** à partir du code et d'un parcours réel de l'application (six comptes — administrateur, responsable qualité, responsable de processus, auditeur interne, auditeur externe, consultant — dans une entreprise vierge), le **2 novembre 2026**.

| Cahier | Pour | Contenu |
|---|---|---|
| [1 — Entreprise](01-cahier-entreprise.md) | administrateur, RQ, responsables, PO, opérateurs, auditeur interne, lecteur | rôles et droits, première connexion, **feuille de route en 10 étapes**, référence de chaque écran, règles, messages d'erreur, limites, check-lists |
| [2 — Auditeur externe](02-cahier-auditeur-externe.md) | certificateur, client auditeur | accès, écrans en lecture seule, **programme de vérification clause par clause**, contrôle d'intégrité des preuves, journal complet, déroulé d'une demi-journée, limites |
| [3 — Organisme accompagnateur](03-cahier-organisme-accompagnateur.md) | cabinet, consultant, opérateur de la plateforme | méthode en 8 phases, guide de conception d'un workflow (exemple testé), programme de contenu à rédiger, ouverture d'une entreprise (`tenant:create`), suivi, fin de mission |

Le **[rapport de parcours et d'écarts](RAPPORT_PARCOURS_ET_ECARTS.md)** dit ce qui existait, ce qui manquait, ce qui a été corrigé ou ajouté pour que ces trois parcours fonctionnent, et **ce qui reste à décider**.

Les captures ([`img/`](img/)) montrent une entreprise fictive (« Atelier Visite SARL »).

## Pour tenir les cahiers à jour

Le texte des cahiers suit le code. Les libellés d'écran (boutons, champs) sont ceux de `apps/frontend/src` ; les droits sont ceux de la table `role_permissions` (migrations 0006, 0013, 0021) ; la notice condensée du guide « Que faire ici ? » est dans `apps/backend/src/lib/notice.ts` (à garder cohérente avec les cahiers).
