# Backlog de contenu métier (constat M12)

**Nature : décision produit, pas un défaut de code.** Le principe fondateur du projet (README) est que
**le responsable qualité définit les workflows ; l'IA ne les génère pas**. Les workflows ci-dessous sont donc
volontairement **non écrits par l'équipe technique** : inventer des étapes, seuils ou règles de validation ISO
reviendrait à produire du contenu normatif sans autorité de validation.

## État au 25/10/2026
- 1 workflow publié dans la bibliothèque globale : `WF_CONTEXT_ANALYSIS` (clause 4.1).
- 54 exigences (annexe N, seed 0002), dont **toutes** sont rattachées par `workflow_requirement_map` à un code de workflow ;
  **26 codes mappés n'ont aucune définition**. La matrice les signale correctement comme lacunes bloquantes
  (« Fonction, preuve ou contrôle non renseigné » / tests non exécutés).
- La matrice annonce elle-même (étape K.1) qu'elle doit être confirmée sur un exemplaire autorisé de la norme.

## Workflows à définir par le responsable qualité (code → clause)
| Clause | Codes mappés sans définition |
|---|---|
| 4 | `WF_PROCESS_MAPPING`, `WF_SCOPE_DEFINITION`, `WF_STAKEHOLDER_ANALYSIS` |
| 5 | `WF_LEADERSHIP_REVIEW`, `WF_POLICY_MANAGEMENT`, `WF_RACI_DEFINITION` |
| 6 | `WF_OBJECTIVE_PLANNING`, `WF_RISK_OPPORTUNITY`, `WF_CHANGE_PLANNING` |
| 7 | `WF_AWARENESS_PROGRAM`, `WF_COMMUNICATION_PLAN`, `WF_COMPETENCY_MANAGEMENT`, `WF_DOCUMENT_CONTROL`, `WF_RESOURCE_PROVISION`, `WF_MONITORING_ANALYSIS` |
| 8 | `WF_DESIGN_CONTROL`, `WF_NC_HANDLING`, `WF_OPERATIONAL_PLANNING`, `WF_PRODUCTION_CONTROL`, `WF_RELEASE_CONTROL`, `WF_REQUIREMENTS_REVIEW`, `WF_SUPPLIER_CONTROL`, `WF_CHANGE_PLANNING` |
| 9 | `WF_INTERNAL_AUDIT`, `WF_MANAGEMENT_REVIEW`, `WF_MONITORING_ANALYSIS` |
| 10 | `WF_CONTINUAL_IMPROVEMENT`, `WF_CORRECTIVE_ACTION` |

Remarque : `WF_INTERNAL_AUDIT`, `WF_MANAGEMENT_REVIEW`, `WF_NC_HANDLING` et `WF_CORRECTIVE_ACTION` sont déjà
couverts **fonctionnellement** par les modules Audits internes, Revues de direction et NC/CAPA ; il reste à
décider s'ils doivent aussi exister comme définitions de workflow (traçabilité matrice).

## Comment les produire
1. Le RQ du tenant duplique un workflow existant ou crée un brouillon (`POST /workflows`), le soumet ;
   **un autre utilisateur** l'approuve (séparation des tâches, H3).
2. Les codes doivent correspondre à `workflow_requirement_map` (ou la carte est ajustée par migration).
3. La bibliothèque globale (tous tenants) se gère aujourd'hui par migration SQL : il n'existe pas d'API
   d'administration réservée aux rôles plateforme (reste ouvert, voir rapport §15).
