-- ============================================================================
-- Seed 0002: Matrice de traçabilité — Annexe N du cahier des charges V4
-- 54 exigences ISO 9001:2026 (clauses 4 à 10) — matrice de départ à confirmer
-- sur exemplaire officiel autorisé (étape K.1).
-- Légende espaces: C = consultant, P = personnel interne, AE = auditeur externe.
-- Convention tests: MT-<réf>-POS / MT-<réf>-NEG (étape K.3, créés en recette).
-- ============================================================================

insert into public.requirements
  (id, clause, title, source_ref, process_owner, software_control, objective_evidence, spaces)
values
-- N.1 — Clause 4: Contexte de l’organisation
('ISO9001-2026-4.1', '4', 'Comprendre l’organisation et son contexte, enjeux internes/externes, dont pertinence du changement climatique', '4.1', 'Responsable qualité + direction', 'Approbation avant publication ; revue périodique planifiée', 'Analyse de contexte versionnée et approuvée', '{C,P}'),
('ISO9001-2026-4.2', '4', 'Comprendre les besoins et attentes des parties intéressées pertinentes', '4.2', 'Responsable qualité', 'Revue validée ; alerte de mise à jour', 'Registre des parties intéressées et de leurs exigences, revu', '{C,P}'),
('ISO9001-2026-4.3', '4', 'Déterminer le périmètre du SMQ et justifier toute exigence non applicable', '4.3', 'Direction / responsable qualité', 'Blocage de publication si justification absente ; consultation auditeur', 'Périmètre approuvé ; justifications signées des non-applicabilités', '{C,P,AE}'),
('ISO9001-2026-4.4', '4', 'Établir, mettre en œuvre et tenir à jour le SMQ et ses processus (interactions, critères, méthodes, ressources, responsabilités)', '4.4', 'Propriétaire de processus', 'Approbation de version ; indicateurs de processus suivis', 'Cartographie des processus, interactions, critères et indicateurs', '{C,P,AE}'),
-- N.2 — Clause 5: Leadership
('ISO9001-2026-5.1', '5', 'Leadership et engagement de la direction, dont promotion de la culture qualité et du comportement éthique (renforcé en 2026)', '5.1', 'Direction', 'Point d’ordre obligatoire en revue ; traçabilité des engagements', 'Décisions, comptes rendus, actions de promotion culture/éthique', '{C,P,AE}'),
('ISO9001-2026-5.2', '5', 'Établir, communiquer et maintenir la politique qualité, alignée sur le contexte et la direction stratégique', '5.2', 'Direction / responsable qualité', 'Accusé de lecture obligatoire ; revue référençant contexte/stratégie', 'Version approuvée ; preuves de diffusion et accusés de lecture', '{C,P,AE}'),
('ISO9001-2026-5.3', '5', 'Attribuer et communiquer rôles, responsabilités et autorités', '5.3', 'Direction / managers', 'Tests de permissions ; séparation des tâches', 'Matrice des responsabilités et habilitations à jour', '{C,P}'),
-- N.3 — Clause 6: Planification
('ISO9001-2026-6.1.1', '6', 'Déterminer les risques à traiter (distinction formalisée 2026)', '6.1.1', 'Propriétaire de processus', 'Séparation structurelle risques/opportunités ; revue', 'Registre des risques évalués, séparé des opportunités', '{C,P}'),
('ISO9001-2026-6.1.2', '6', 'Déterminer les opportunités à saisir', '6.1.2', 'Propriétaire de processus', 'Séparation structurelle ; revue', 'Registre des opportunités évalué, séparé des risques', '{C,P}'),
('ISO9001-2026-6.1.3', '6', 'Planifier les actions face aux risques et opportunités et évaluer leur efficacité', '6.1.3', 'Responsable qualité', 'Échéances suivies ; évaluation d’efficacité exigée', 'Plans d’action rattachés à un risque ou une opportunité, avec évaluation d’efficacité', '{C,P}'),
('ISO9001-2026-6.2', '6', 'Établir des objectifs qualité mesurables et planifier leur atteinte', '6.2', 'Direction / responsable qualité', 'Tableau de bord ; revue périodique', 'Objectifs, indicateurs, responsables, bilans de suivi', '{C,P,AE}'),
('ISO9001-2026-6.3', '6', 'Planifier les changements du SMQ de manière maîtrisée', '6.3', 'Responsable habilité', 'Approbation préalable ; intégrité du SMQ vérifiée', 'Analyse d’impact, plan et approbation du changement', '{C,P}');

-- N.4 — Clause 7: Support
insert into public.requirements
  (id, clause, title, source_ref, process_owner, software_control, objective_evidence, spaces)
values
('ISO9001-2026-7.1.1', '7', 'Déterminer et fournir les ressources nécessaires au SMQ', '7.1.1', 'Manager responsable', 'Revue des ressources en revue de direction', 'Analyse des besoins et disponibilités', '{P}'),
('ISO9001-2026-7.1.2', '7', 'Fournir les personnes nécessaires', '7.1.2', 'RH / manager', 'Contrôle des affectations et suppléances', 'Effectifs et affectations documentés', '{P}'),
('ISO9001-2026-7.1.3', '7', 'Déterminer, fournir et maintenir les infrastructures', '7.1.3', 'Manager responsable', 'Échéancier de maintenance ; alertes', 'Registre des équipements et maintenance', '{P}'),
('ISO9001-2026-7.1.4', '7', 'Déterminer et gérer l’environnement d’exécution des processus', '7.1.4', 'Manager responsable', 'Contrôles planifiés ; écarts traités', 'Surveillance des conditions d’environnement', '{P}'),
('ISO9001-2026-7.1.5', '7', 'Fournir et maîtriser les ressources de surveillance et de mesure (étalonnage/vérification)', '7.1.5', 'Responsable qualité', 'Alerte d’expiration d’étalonnage ; blocage d’usage', 'Certificats d’étalonnage, historiques de vérification', '{P,AE}'),
('ISO9001-2026-7.1.6', '7', 'Déterminer et maintenir les connaissances organisationnelles', '7.1.6', 'Responsable qualité', 'Revue des contenus ; gestion des accès', 'Base de connaissances versionnée et revue', '{C,P}'),
('ISO9001-2026-7.2', '7', 'Assurer la compétence du personnel et conserver les preuves', '7.2', 'RH / manager', 'Blocage d’affectation si compétence requise absente', 'Matrice de compétences, formations, évaluations d’efficacité', '{C,P}'),
('ISO9001-2026-7.3', '7', 'Assurer la sensibilisation (politique, objectifs, contribution, conséquences ; culture qualité et éthique en 2026)', '7.3', 'Manager', 'Accusés et évaluations obligatoires', 'Sessions, attestations, évaluations de compréhension', '{P}'),
('ISO9001-2026-7.4', '7', 'Déterminer les communications internes et externes pertinentes', '7.4', 'Responsable désigné', 'Journal de diffusion ; destinataires contrôlés', 'Plan de communication et preuves de diffusion', '{C,P}'),
('ISO9001-2026-7.5.1', '7', 'Maîtriser les informations documentées exigées (création et mise à jour)', '7.5.1', 'Document controller', 'Cycle brouillon → revue → approbation → publication', 'Documents identifiés, versionnés, approuvés', '{C,P,AE}'),
('ISO9001-2026-7.5.2', '7', 'Maîtriser la création et la mise à jour (identification, format, revue/approbation)', '7.5.2', 'Document controller', 'Validation serveur des métadonnées obligatoires', 'Métadonnées complètes par version', '{C,P}'),
('ISO9001-2026-7.5.3', '7', 'Maîtriser la diffusion, l’accès, la protection et la conservation des informations documentées (y compris numériques ou générées par IA)', '7.5.3', 'Document controller', 'Permissions par version ; distinction des contenus IA', 'Journal d’accès, versions archivées, permissions', '{C,P,AE}');

-- N.5 — Clause 8: Réalisation des activités opérationnelles
insert into public.requirements
  (id, clause, title, source_ref, process_owner, software_control, objective_evidence, spaces)
values
('ISO9001-2026-8.1', '8', 'Planifier, mettre en œuvre et maîtriser les processus opérationnels', '8.1', 'Propriétaire de processus', 'Guardrails déterministes ; surveillance des critères', 'Critères, ressources et contrôles documentés', '{P}'),
('ISO9001-2026-8.2.1', '8', 'Assurer la communication avec les clients', '8.2.1', 'Commercial / responsable désigné', 'Traçabilité des engagements pris', 'Journal des échanges clients', '{P}'),
('ISO9001-2026-8.2.2', '8', 'Déterminer les exigences relatives aux produits et services', '8.2.2', 'Commercial / responsable désigné', 'Validation avant engagement', 'Recueil d’exigences documenté', '{P}'),
('ISO9001-2026-8.2.3', '8', 'Revoir les exigences avant engagement et en cas de modification', '8.2.3', 'Responsable désigné', 'Blocage d’engagement sans revue validée', 'Compte rendu de revue d’exigences', '{P}'),
('ISO9001-2026-8.2.4', '8', 'Gérer les modifications des exigences et informer les personnes concernées', '8.2.4', 'Responsable désigné', 'Notification tracée aux parties concernées', 'Avenants et preuves de diffusion', '{P}'),
('ISO9001-2026-8.3', '8', 'Concevoir et développer les produits et services (si applicable ; sinon justification 4.3)', '8.3', 'Responsable conception', 'Revues et validations formalisées ; justification approuvée si N/A', 'Entrées, revues, vérifications, validations, modifications', '{C,P,AE}'),
('ISO9001-2026-8.4.1', '8', 'Évaluer, sélectionner et surveiller les prestataires externes', '8.4.1', 'Achats / qualité', 'Réévaluation périodique ; blocage fournisseur non évalué', 'Évaluations, critères de sélection, suivis', '{P,AE}'),
('ISO9001-2026-8.4.2', '8', 'Définir le type et l’étendue de la maîtrise des prestataires', '8.4.2', 'Achats / qualité', 'Contrôles à réception planifiés', 'Critères de maîtrise par prestataire', '{P}'),
('ISO9001-2026-8.4.3', '8', 'Communiquer aux prestataires les exigences applicables', '8.4.3', 'Achats', 'Validation avant envoi ; traçabilité', 'Commandes et exigences documentées', '{P}'),
('ISO9001-2026-8.5.1', '8', 'Maîtriser la production et la prestation dans des conditions planifiées', '8.5.1', 'Opérateur / superviseur', 'Contrôles en cours ; seuils configurés', 'Mesures, paramètres, instructions suivies', '{P,AE}'),
('ISO9001-2026-8.5.2', '8', 'Identifier les sorties et assurer la traçabilité requise', '8.5.2', 'Opérateur', 'Scans contrôlés ; cohérence objet', 'Identifiants, lots et statuts enregistrés', '{P}'),
('ISO9001-2026-8.5.3', '8', 'Maîtriser la propriété appartenant aux clients ou prestataires', '8.5.3', 'Responsable désigné', 'Signalement obligatoire de perte ou dommage', 'Registre des biens confiés', '{P}'),
('ISO9001-2026-8.5.4', '8', 'Préserver les sorties pendant la production et la prestation', '8.5.4', 'Opérateur', 'Inspections planifiées ; écarts traités', 'Contrôles de stockage et manutention', '{P}'),
('ISO9001-2026-8.5.5', '8', 'Maîtriser les activités post-livraison', '8.5.5', 'Responsable désigné', 'Journal des actions post-livraison', 'Suivi, retours, SAV documentés', '{P}'),
('ISO9001-2026-8.5.6', '8', 'Revoir et maîtriser les modifications de la production ou de la prestation', '8.5.6', 'Responsable habilité', 'Journal des modifications autorisées', 'Analyse et approbation des modifications', '{P}'),
('ISO9001-2026-8.6', '8', 'Vérifier les sorties et gérer leur libération', '8.6', 'Personnel autorisé', 'Blocage de libération sans vérification conforme', 'Résultats de vérification et autorisation de libération', '{P,AE}'),
('ISO9001-2026-8.7.1', '8', 'Identifier et maîtriser les sorties non conformes', '8.7.1', 'Qualité / responsable autorisé', 'Statuts bloquants ; séparation des rôles', 'Identification, décision et traitement des sorties NC', '{P,AE}'),
('ISO9001-2026-8.7.2', '8', 'Conserver les informations documentées sur les non-conformités', '8.7.2', 'Qualité', 'Journal d’audit non modifiable', 'Registre NC documenté et à jour', '{P,AE}');

-- N.6 — Clause 9: Évaluation des performances
insert into public.requirements
  (id, clause, title, source_ref, process_owner, software_control, objective_evidence, spaces)
values
('ISO9001-2026-9.1.1', '9', 'Déterminer quoi surveiller/mesurer, quand, comment, et analyser les résultats', '9.1.1', 'Responsable qualité', 'Revue des résultats planifiée', 'Plan de mesure et tableaux d’indicateurs', '{C,P,AE}'),
('ISO9001-2026-9.1.2', '9', 'Surveiller la perception et la satisfaction des clients', '9.1.2', 'Responsable désigné', 'Analyse périodique ; actions liées', 'Enquêtes, réclamations, retours analysés', '{P}'),
('ISO9001-2026-9.1.3', '9', 'Analyser et évaluer les données et informations issues de la surveillance', '9.1.3', 'Responsable qualité', 'Revue qualité ; données sources traçables', 'Rapports d’analyse et conclusions', '{C,P}'),
('ISO9001-2026-9.2.1', '9', 'Conduire des audits internes à intervalles planifiés', '9.2.1', 'Auditeur habilité', 'Programme couvrant les processus ; suivi', 'Programme d’audit approuvé', '{C,P,AE}'),
('ISO9001-2026-9.2.2', '9', 'Planifier, mettre en œuvre et documenter le programme d’audit (impartialité, critères, constats, suivi)', '9.2.2', 'Auditeur habilité', 'Détection d’auto-audit ; suivi des corrections', 'Plans, checklists, constats et rapports d’audit', '{C,P,AE}'),
('ISO9001-2026-9.3.1', '9', 'Procéder à la revue de direction à intervalles planifiés', '9.3.1', 'Direction', 'Planification et tenue vérifiées', 'Compte rendu de revue de direction', '{C,P,AE}'),
('ISO9001-2026-9.3.2', '9', 'Traiter toutes les entrées exigées de la revue de direction', '9.3.2', 'Direction / responsable qualité', 'Checklist bloquante des entrées obligatoires', 'Dossier d’entrées complet par revue', '{C,P}'),
('ISO9001-2026-9.3.3', '9', 'Documenter les sorties : décisions d’amélioration, besoins de changement, ressources', '9.3.3', 'Direction', 'Suivi des actions issues de la revue', 'Décisions, actions, responsables et échéances', '{C,P,AE}'),
-- N.7 — Clause 10: Amélioration
('ISO9001-2026-10.1', '10', 'Déterminer les opportunités d’amélioration et mettre en œuvre les actions nécessaires', '10.1', 'Propriétaire de processus', 'Suivi des actions d’amélioration', 'Registre des opportunités et plans associés', '{C,P}'),
('ISO9001-2026-10.2.1', '10', 'Réagir aux non-conformités : correction, analyse des causes, action corrective, évaluation d’efficacité, mise à jour des risques', '10.2.1', 'Responsable qualité', 'Clôture bloquée sans vérification d’efficacité exigée', 'Dossier NC complet : faits, causes, actions, efficacité', '{C,P,AE}'),
('ISO9001-2026-10.2.2', '10', 'Conserver les informations documentées sur les NC et les actions correctives', '10.2.2', 'Responsable qualité', 'Journal non modifiable ; conservation contrôlée', 'Registre NC/CAPA horodaté et versionné', '{P,AE}'),
('ISO9001-2026-10.3', '10', 'Améliorer continuellement la pertinence, l’adéquation et l’efficacité du SMQ', '10.3', 'Direction / responsable qualité', 'Indicateurs de progression ; revue de direction', 'Analyses, revues et progrès documentés', '{C,P,AE}');

-- Méthode de vérification par ligne (étape K.2): couple MT-<réf>-POS/NEG (K.3)
update public.requirements
set verification_method = 'Test fonctionnel MT-' || source_ref || '-POS / MT-' || source_ref
  || '-NEG + contrôle documentaire (exécution en recette, étape K.3)';

-- Cartographie exigence -> workflow (annexe N, colonne « Fonction / workflow »)
insert into public.workflow_requirement_map (workflow_code, requirement_id, coverage_type) values
('WF_CONTEXT_ANALYSIS', 'ISO9001-2026-4.1', 'primary'),
('WF_STAKEHOLDER_ANALYSIS', 'ISO9001-2026-4.2', 'primary'),
('WF_SCOPE_DEFINITION', 'ISO9001-2026-4.3', 'primary'),
('WF_PROCESS_MAPPING', 'ISO9001-2026-4.4', 'primary'),
('WF_LEADERSHIP_REVIEW', 'ISO9001-2026-5.1', 'primary'),
('WF_POLICY_MANAGEMENT', 'ISO9001-2026-5.2', 'primary'),
('WF_RACI_DEFINITION', 'ISO9001-2026-5.3', 'primary'),
('WF_RISK_OPPORTUNITY', 'ISO9001-2026-6.1.1', 'primary'),
('WF_RISK_OPPORTUNITY', 'ISO9001-2026-6.1.2', 'primary'),
('WF_RISK_OPPORTUNITY', 'ISO9001-2026-6.1.3', 'primary'),
('WF_OBJECTIVE_PLANNING', 'ISO9001-2026-6.2', 'primary'),
('WF_CHANGE_PLANNING', 'ISO9001-2026-6.3', 'primary'),
('WF_RESOURCE_PROVISION', 'ISO9001-2026-7.1.1', 'primary'),
('WF_RESOURCE_PROVISION', 'ISO9001-2026-7.1.2', 'primary'),
('WF_RESOURCE_PROVISION', 'ISO9001-2026-7.1.3', 'primary'),
('WF_RESOURCE_PROVISION', 'ISO9001-2026-7.1.4', 'primary'),
('WF_MONITORING_ANALYSIS', 'ISO9001-2026-7.1.5', 'primary'),
('WF_DOCUMENT_CONTROL', 'ISO9001-2026-7.1.6', 'primary'),
('WF_COMPETENCY_MANAGEMENT', 'ISO9001-2026-7.2', 'primary'),
('WF_AWARENESS_PROGRAM', 'ISO9001-2026-7.3', 'primary'),
('WF_COMMUNICATION_PLAN', 'ISO9001-2026-7.4', 'primary'),
('WF_DOCUMENT_CONTROL', 'ISO9001-2026-7.5.1', 'primary'),
('WF_DOCUMENT_CONTROL', 'ISO9001-2026-7.5.2', 'primary'),
('WF_DOCUMENT_CONTROL', 'ISO9001-2026-7.5.3', 'primary'),
('WF_OPERATIONAL_PLANNING', 'ISO9001-2026-8.1', 'primary'),
('WF_REQUIREMENTS_REVIEW', 'ISO9001-2026-8.2.1', 'primary'),
('WF_REQUIREMENTS_REVIEW', 'ISO9001-2026-8.2.2', 'primary'),
('WF_REQUIREMENTS_REVIEW', 'ISO9001-2026-8.2.3', 'primary'),
('WF_REQUIREMENTS_REVIEW', 'ISO9001-2026-8.2.4', 'primary'),
('WF_DESIGN_CONTROL', 'ISO9001-2026-8.3', 'primary'),
('WF_SUPPLIER_CONTROL', 'ISO9001-2026-8.4.1', 'primary'),
('WF_SUPPLIER_CONTROL', 'ISO9001-2026-8.4.2', 'primary'),
('WF_SUPPLIER_CONTROL', 'ISO9001-2026-8.4.3', 'primary'),
('WF_PRODUCTION_CONTROL', 'ISO9001-2026-8.5.1', 'primary'),
('WF_PRODUCTION_CONTROL', 'ISO9001-2026-8.5.2', 'primary'),
('WF_PRODUCTION_CONTROL', 'ISO9001-2026-8.5.3', 'primary'),
('WF_PRODUCTION_CONTROL', 'ISO9001-2026-8.5.4', 'primary'),
('WF_PRODUCTION_CONTROL', 'ISO9001-2026-8.5.5', 'primary'),
('WF_CHANGE_PLANNING', 'ISO9001-2026-8.5.6', 'primary'),
('WF_RELEASE_CONTROL', 'ISO9001-2026-8.6', 'primary'),
('WF_NC_HANDLING', 'ISO9001-2026-8.7.1', 'primary'),
('WF_NC_HANDLING', 'ISO9001-2026-8.7.2', 'primary'),
('WF_MONITORING_ANALYSIS', 'ISO9001-2026-9.1.1', 'primary'),
('WF_MONITORING_ANALYSIS', 'ISO9001-2026-9.1.2', 'primary'),
('WF_MONITORING_ANALYSIS', 'ISO9001-2026-9.1.3', 'primary'),
('WF_INTERNAL_AUDIT', 'ISO9001-2026-9.2.1', 'primary'),
('WF_INTERNAL_AUDIT', 'ISO9001-2026-9.2.2', 'primary'),
('WF_MANAGEMENT_REVIEW', 'ISO9001-2026-9.3.1', 'primary'),
('WF_MANAGEMENT_REVIEW', 'ISO9001-2026-9.3.2', 'primary'),
('WF_MANAGEMENT_REVIEW', 'ISO9001-2026-9.3.3', 'primary'),
('WF_CONTINUAL_IMPROVEMENT', 'ISO9001-2026-10.1', 'primary'),
('WF_CORRECTIVE_ACTION', 'ISO9001-2026-10.2.1', 'primary'),
('WF_CORRECTIVE_ACTION', 'ISO9001-2026-10.2.2', 'primary'),
('WF_CONTINUAL_IMPROVEMENT', 'ISO9001-2026-10.3', 'primary');

