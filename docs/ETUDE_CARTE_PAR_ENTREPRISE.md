# Étude — carte exigences ↔ workflows modifiable par entreprise

Date : 2026-10-29 · Nature : étude, **aucun code modifié** · Base : `main` (23d8146)

---

## 0. Correction de ce qui a été dit plus tôt

Deux affirmations faites dans cette session étaient **fausses** et sont corrigées ici, après lecture du code :

| Affirmation | Réalité (code de `main`) |
|---|---|
| « Pour qu'une exigence soit reconnue comme couverte, l'entreprise doit créer un workflow qui porte exactement le code prévu. » | **Rien ne l'exige.** La carte n'est jamais comparée aux workflows existants. |
| « La matrice montre ces exigences comme lacunes tant que leur workflow n'est pas défini. » | **Faux.** Le statut « lacune bloquante » est calculé par `computeState()` (`routes/matrix.ts`) à partir du responsable, de la preuve attendue, de la méthode de vérification et des tests. La carte n'y intervient pas. |

La phrase du backlog (`BACKLOG_CONTENU_METIER.md` : « la matrice les signale comme lacunes bloquantes ») est donc inexacte sur ce point. Les 54 lacunes bloquantes actuelles viennent des **tests non exécutés**, pas des workflows manquants.

---

## 1. État actuel de la carte (vérifié)

- **Table** `workflow_requirement_map(workflow_code, requirement_id, coverage_type)` : globale, sans `tenant_id`, lisible par tout utilisateur connecté, **écriture uniquement par migration SQL** (aucune API).
- **Contenu** (base cloud, 29/10/2026) : 54 lignes, 54 exigences, **27 codes** distincts. Chaque exigence a **exactement un code** (0 exigence avec plusieurs). 14 codes sur 27 ne couvrent qu'une seule exigence. `coverage_type` vaut `primary` partout et n'est lu nulle part.
- **Usage** : une seule lecture, `loadMatrix()` (`routes/matrix.ts`), qui alimente `workflow_codes` pour :
  1. l'affichage sous le titre de chaque ligne (`Traceability.tsx`) — avec le texte « workflow à associer » quand la liste est vide, **alors qu'aucun écran ne permet d'associer quoi que ce soit** ;
  2. la colonne du CSV d'export.
- **Statut** : aucun effet sur `gap_status`, `blocking`, la couverture par clause ou par espace.
- **Codes des workflows de l'entreprise** : un workflow du tenant porte un identifiant `CODE__<8 caractères du tenant>` (ex. `WF_X__a1b2c3d4`), ses versions `…_V2`. La fonction `baseCode()` retrouve la racine. **Un workflow d'entreprise n'a donc jamais le même identifiant que le code de la carte.**
- **Modules déjà fonctionnels** : 4 codes (`WF_INTERNAL_AUDIT`, `WF_MANAGEMENT_REVIEW`, `WF_NC_HANDLING`, `WF_CORRECTIVE_ACTION`) correspondent à des modules existants et concernent **9 exigences** (9.2.1, 9.2.2, 9.3.1–9.3.3, 8.7.1, 8.7.2, 10.2.1, 10.2.2).

Conclusion : la carte est aujourd'hui un **repère de lecture**, pas un mécanisme de couverture.

---

## 2. Ce qu'une carte par entreprise apporterait

1. **Traçabilité utilisable** : répondre à l'auditeur « comment l'exigence 7.5 est-elle couverte chez vous ? » par un lien réel (workflow publié, document, module), modifiable, daté, motivé.
2. **Liens vers les workflows propres à l'entreprise** (avec versions) et vers les **modules** (audits, revues, NC/CAPA).
3. **Souplesse de structure** : un petit organisme couvre plusieurs exigences par un même processus ; un grand en répartit une sur plusieurs workflows (par site, plus tard).
4. **Suppression du faux appel à l'action** « workflow à associer ».
5. Option, ensuite : une règle de couverture (voir §5).

---

## 3. Options de conception

| | A. Surcouche (recommandée) | B. Copie par tenant | C. Lien porté par le workflow |
|---|---|---|---|
| Principe | La carte globale reste en **suggestions** ; le tenant ajoute ses liens et peut écarter une suggestion. Carte effective = suggestions − écartées + liens du tenant. | La carte globale est copiée dans le tenant ; le tenant l'édite. | Chaque workflow déclare les exigences qu'il couvre, dans son éditeur, avec son cycle brouillon → approbation. |
| Données existantes | Aucune migration | Copie de 54 lignes par tenant | Carte globale à réécrire |
| Évolution du catalogue | Suivie automatiquement | Dérive entre copies | Suivie par workflow |
| Liens vers modules / documents | Oui | Oui | **Non** (pas de workflow) |
| Validation à deux personnes | Au choix | Au choix | **Native** (celle du workflow) |
| Complexité de lecture | Moyenne (fusion) | Faible | Moyenne |
| Risque | Deux sources à fusionner | Dérive silencieuse | Exigences sans workflow non représentables |

**Recommandation : A**, avec une évolution ultérieure vers C comme *aide à la saisie* (cocher les exigences couvertes dans l'éditeur de workflow, qui écrit dans la même table de liens).

---

## 4. Modèle de données proposé (option A)

Table `tenant_requirement_links` :

| Colonne | Rôle |
|---|---|
| `id`, `tenant_id` → `tenants` (cascade) | Isolation par entreprise |
| `requirement_id` → `requirements` | Exigence couverte |
| `kind` : `workflow` \| `module` \| `exclusion` | Lien vers un workflow, vers un module, ou suggestion écartée |
| `workflow_family` | Code **racine** (`baseCode`) : survit aux versions `_V2` et au suffixe tenant |
| `module` : `audits` \| `reviews` \| `nonconformities` \| `documents` | Si `kind = module` |
| `coverage_type` : `primary` \| `supporting` | Utilise enfin la colonne existante |
| `reason` (obligatoire), `created_by`, `created_at`, `removed_at` | Motif L.5, historique, retrait doux |
| `site_id` (nullable, **non créé maintenant**) | Prévu pour que l'ajout d'une dimension « site » ne casse rien |

Contraintes : unicité `(tenant_id, requirement_id, kind, workflow_family/module)` pour les liens actifs ; RLS tenant en lecture, écritures via `service_role` seulement (convention de la migration 0014, qui impose RLS et aucun droit d'écriture direct).

**Carte effective**, calculée dans `loadMatrix()` : suggestions globales, moins les exclusions, plus les liens du tenant. Chaque lien est annoté de l'état du workflow : *publié*, *brouillon*, *déprécié*, *introuvable*, ou *module*.

---

## 5. Décision de fond : que signifie « couvert » ?

Aujourd'hui, rien ne dépend de la carte. Trois niveaux possibles :

1. **Informatif** (phase 1, sans impact sur les chiffres) : liens visibles et éditables.
2. **Avertissement** : raison non bloquante « aucun workflow publié ni module ne couvre cette exigence ».
3. **Bloquant**, **par option d'entreprise** : une exigence applicable sans lien actif est une lacune bloquante.

Le niveau 3 ne doit pas être imposé par défaut : il bloquerait une petite entreprise tant qu'elle n'a pas écrit ses workflows, et la plateforme n'en fournit qu'un seul.

---

## 6. Impacts sur l'existant

| Zone | Impact |
|---|---|
| `loadMatrix()` | 1 requête de plus ; le champ `workflow_codes` est conservé (compatibilité) et un champ `links` s'ajoute |
| `computeState()` | Inchangé en phase 1 ; une raison s'ajoute en phase 2 |
| Couverture par clause / espace, exports | Chiffres inchangés en phase 1 ; colonne CSV enrichie (code, état, type) |
| API | `GET/POST/DELETE /matrix/requirements/:id/links`, motif obligatoire, événements `matrix.link.add` / `matrix.link.remove` dans le journal d'audit |
| Permissions | Même droit que l'édition K.2 (`workflow.edit_draft`, route `PATCH /matrix/requirements/:id`) ; question ouverte : validation par une 2ᵉ personne (§8) |
| Interface | Panneau de la ligne : liens ajoutables/retirables avec motif ; le texte « workflow à associer » devient actionnable ; filtre « sans lien » |
| Validation par un spécialiste (K.5) | Une modification de lien après validation d'un périmètre devrait être signalée (question ouverte) |
| Versions de workflow | Liens portés par la **racine** : `_V2` hérite ; un workflow déprécié est signalé, pas supprimé |
| Suppression d'un tenant | Cascade normale (table non protégée par les triggers d'immuabilité de 0019) |
| Guide « Que faire ici ? » et notice | Une étape « N exigences sans lien » ; section 4.3 de la notice à mettre à jour |
| Tests | Fonction pure de fusion de la carte (hors ligne, comme `test_matrix_logic.ts`) + scénario E2E |
| Plusieurs sites | Non traité ; la colonne `site_id` prévue évite une refonte, mais la notion de site reste à créer (étude séparée) |

---

## 7. Plan par phases

| Phase | Contenu | Taille |
|---|---|---|
| 1 | Migration + RLS, fonction de fusion testée, API des liens, `loadMatrix()`, éditeur dans la matrice, CSV | **M** (une PR) |
| 2 | Avertissement de couverture, étape du guide, notice | **S** |
| 3 | Option « couverture bloquante » par entreprise ; liens vers modules détectés automatiquement (ex. une revue de direction tenue = preuve pour 9.3) | **M** |
| 4 | Cases « exigences couvertes » dans l'éditeur de workflow (option C en aide à la saisie) | **M** |

Aucune migration de données n'est nécessaire en phase 1 : les entreprises existantes héritent des suggestions globales.

---

## 8. Décisions à prendre (product owner)

1. Un lien manquant est-il **informatif, avertissement ou bloquant** — et le choix est-il **par entreprise** ?
2. Qui peut modifier les liens, et faut-il **l'approbation d'une 2ᵉ personne** (comme pour une non-applicabilité) ou un simple motif ?
3. Une modification de lien **invalide-t-elle** une validation de spécialiste (K.5) ?
4. Un module utilisé (audit clôturé, revue tenue, NC traitée) vaut-il **couverture automatique** de ses exigences ?
5. La carte globale doit-elle rester la **référence du catalogue** (suggestions) ou devenir un simple point de départ copié (option B) ?

## 9. Risques

- **Deux sources** (suggestions et liens) mal expliquées : à étiqueter clairement dans l'interface.
- **Faux sentiment de conformité** : un lien n'est pas une preuve ; le statut reste porté par les tests et les preuves.
- **Lien vers un workflow supprimé ou déprécié** : état explicite, jamais silencieux.
- **Dérive d'interprétation** : la carte d'origine est un choix des auteurs du cahier des charges (annexe N), pas une exigence de la norme.

---

## 10. Décisions prises et état d'avancement (29/10/2026)

| # | Décision | Source |
|---|---|---|
| 1 | Un lien manquant donne un **avertissement non bloquant** ; l'option « bloquant » par entreprise est reportée (phase 3). | Product owner |
| 2 | Même droit que l'édition K.2 (`workflow.edit_draft`), **motif obligatoire**, sans approbation d'une 2ᵉ personne. | Défaut retenu, **à confirmer** |
| 3 | Une modification de lien **n'invalide pas** une validation de spécialiste (K.5) ; non traité. | Défaut retenu, **à confirmer** |
| 4 | Pas de couverture automatique par module : l'entreprise lie les modules elle-même. | Défaut retenu, **à confirmer** |
| 5 | La carte globale reste le catalogue de **suggestions** (option A, surcouche). | Étude |

**Livré dans la PR « carte par entreprise » (phase 1 + avertissement)** : migration 0020 (`tenant_requirement_links`),
fonctions de fusion testées hors ligne (`lib/requirementLinks.ts`), routes `POST /matrix/requirements/:id/links` et
`…/links/:linkId/remove`, chargement de la carte effective dans `loadMatrix()`, champs `links`, `excluded_suggestions` et
`warnings`, colonnes CSV, éditeur dans le panneau de la matrice.

**Non livré** : étape du guide « N exigences sans lien » (le guide met en cache les compteurs de la matrice : son empreinte devra
inclure les liens), option par entreprise « couverture bloquante », liens automatiques vers les modules, cases « exigences
couvertes » dans l'éditeur de workflow, notion de site.
