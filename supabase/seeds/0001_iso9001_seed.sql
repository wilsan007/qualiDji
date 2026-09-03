-- ============================================================================
-- Seed: ISO 9001:2015 — Standards, Clauses, and Requirements
-- ============================================================================
-- Structure: chapters 4-10 (HLS), ~250 atomic requirements
-- Each requirement has 3 explanation levels (novice, intermediate, expert)
-- and expected evidence in French (with English/Arabic/Somali for key fields)
-- ============================================================================

-- Standard
insert into public.standards (id, code, name, version, lang) values
('90000000-0000-0000-0000-000000000001', 'ISO9001_2015', 'ISO 9001:2015 — Systèmes de management de la qualité', '2015', 'fr')
on conflict (code) do nothing;

-- ============================================================================
-- CLAUSES (chapters 4-10 with sub-clauses)
-- ============================================================================

-- Chapter 4: Contexte de l'organisme
insert into public.clauses (id, standard_id, number, title, title_en, title_ar, title_so, sort_order) values
('90010000-0000-0000-0000-000000000004', '90000000-0000-0000-0000-000000000001', '4', 'Contexte de l''organisme', 'Context of the organization', 'سياق المنظمة', 'Kontextka hay''adda', 4),
('90010000-0000-0000-0000-000000000041', '90000000-0000-0000-0000-000000000001', '4.1', 'Compréhension de l''organisme et de son contexte', 'Understanding the organization and its context', 'فهم المنظمة وسياقها', 'Fahmitka hay''adda iyo kontextkeeda', 41),
('90010000-0000-0000-0000-000000000042', '90000000-0000-0000-0000-000000000001', '4.2', 'Compréhension des besoins et attentes des parties intéressées', 'Understanding needs of interested parties', 'فهم احتياجات الأطراف المعنية', 'Fahmita baahiyaha dhinacyada xiisaynaya', 42),
('90010000-0000-0000-0000-000000000043', '90000000-0000-0000-0000-000000000001', '4.3', 'Détermination du périmètre du système de management de la qualité', 'Determining the scope of the QMS', 'تحديد نطاق نظام إدارة الجودة', 'Go''aaminta ujeedada nidaamka maamulka tayada', 43),
('90010000-0000-0000-0000-000000000044', '90000000-0000-0000-0000-000000000001', '4.4', 'Système de management de la qualité et ses processus', 'QMS and its processes', 'نظام إدارة الجودة وعملياته', 'Nidaamka maamulka tayada iyo habraaca kiisa', 44);

-- Chapter 5: Leadership
insert into public.clauses (id, standard_id, number, title, title_en, title_ar, title_so, sort_order) values
('90010000-0000-0000-0000-000000000005', '90000000-0000-0000-0000-000000000001', '5', 'Leadership', 'Leadership', 'القيادة', 'Hogaaminta', 5),
('90010000-0000-0000-0000-000000000051', '90000000-0000-0000-0000-000000000001', '5.1', 'Leadership et engagement de la direction', 'Leadership and commitment', 'القيادة والتزام الإدارة', 'Hogaaminta iyo xilka maamulka', 51),
('90010000-0000-0000-0000-000000000511', '90000000-0000-0000-0000-000000000001', '5.1.1', 'Leadership et engagement pour le SMQ', 'Leadership and commitment for QMS', 'القيادة والتزام لنظام إدارة الجودة', 'Hogaaminta iyo xilka SMQ', 511),
('90010000-0000-0000-0000-000000000512', '90000000-0000-0000-0000-000000000001', '5.1.2', 'Orientation client', 'Customer focus', 'التركيز على العميل', 'Diiradda macmiilka', 512),
('90010000-0000-0000-0000-000000000052', '90000000-0000-0000-0000-000000000001', '5.2', 'Politique qualité', 'Quality policy', 'سياسة الجودة', 'Siyaasadda tayada', 52),
('90010000-0000-0000-0000-000000000521', '90000000-0000-0000-0000-000000000001', '5.2.1', 'Établissement de la politique qualité', 'Establishing the quality policy', 'وضع سياسة الجودة', 'Dajinta siyaasadda tayada', 521),
('90010000-0000-0000-0000-000000000522', '90000000-0000-0000-0000-000000000001', '5.2.2', 'Communication de la politique qualité', 'Communicating the quality policy', 'تواصل سياسة الجودة', 'Gudbinta siyaasadda tayada', 522),
('90010000-0000-0000-0000-000000000053', '90000000-0000-0000-0000-000000000001', '5.3', 'Rôles, responsabilités et autorités dans l''organisme', 'Organizational roles, responsibilities and authorities', 'الأدوار والمسؤوليات والصلاحيات', 'Hannaanka, mas''uuliyadda iyo xukunka', 53);

-- Chapter 6: Planification
insert into public.clauses (id, standard_id, number, title, title_en, title_ar, title_so, sort_order) values
('90010000-0000-0000-0000-000000000006', '90000000-0000-0000-0000-000000000001', '6', 'Planification', 'Planning', 'التخطيط', 'Qorshaynta', 6),
('90010000-0000-0000-0000-000000000061', '90000000-0000-0000-0000-000000000001', '6.1', 'Actions à mettre en œuvre pour traiter les risques et opportunités', 'Actions to address risks and opportunities', 'إجراءات معالجة المخاطر والفرص', 'Hawlgallo ka jawaabidda khataraha iyo fursadaha', 61),
('90010000-0000-0000-0000-000000000062', '90000000-0000-0000-0000-000000000001', '6.2', 'Objectifs qualité et planification pour les atteindre', 'Quality objectives and planning', 'أهداف الجودة والتخطيط لتحقيقها', 'Hadda tayada iyo qorshaynta la gaadho', 62),
('90010000-0000-0000-0000-000000000621', '90000000-0000-0000-0000-000000000001', '6.2.1', 'Objectifs qualité', 'Quality objectives', 'أهداف الجودة', 'Hadda tayada', 621),
('90010000-0000-0000-0000-000000000622', '90000000-0000-0000-0000-000000000001', '6.2.2', 'Planification pour atteindre les objectifs qualité', 'Planning to achieve quality objectives', 'التخطيط لتحقيق أهداف الجودة', 'Qorshaynta la gaadho hadda tayada', 622),
('90010000-0000-0000-0000-000000000063', '90000000-0000-0000-0000-000000000001', '6.3', 'Planification des modifications', 'Planning of changes', 'تخطيط التغييرات', 'Qorshaynta isbeddelka', 63);

-- Chapter 7: Support
insert into public.clauses (id, standard_id, number, title, title_en, title_ar, title_so, sort_order) values
('90010000-0000-0000-0000-000000000007', '90000000-0000-0000-0000-000000000001', '7', 'Support', 'Support', 'الدعم', 'Taageerada', 7),
('90010000-0000-0000-0000-000000000071', '90000000-0000-0000-0000-000000000001', '7.1', 'Ressources', 'Resources', 'الموارد', 'Khayraadka', 71),
('90010000-0000-0000-0000-000000000711', '90000000-0000-0000-0000-000000000001', '7.1.1', 'Généralités', 'General', 'عام', 'Guud', 711),
('90010000-0000-0000-0000-000000000712', '90000000-0000-0000-0000-000000000001', '7.1.2', 'Personnes', 'People', 'الأشخاص', 'Dadka', 712),
('90010000-0000-0000-0000-000000000713', '90000000-0000-0000-0000-000000000001', '7.1.3', 'Infrastructure', 'Infrastructure', 'البنية التحتية', 'Infrastaructure-ka', 713),
('90010000-0000-0000-0000-000000000714', '90000000-0000-0000-0000-000000000001', '7.1.4', 'Environnement pour le fonctionnement des processus', 'Environment for process operation', 'بيئة تشغيل العمليات', 'Dhakadka shaqada habraaca', 714),
('90010000-0000-0000-0000-000000000715', '90000000-0000-0000-0000-000000000001', '7.1.5', 'Ressources de surveillance et de mesure', 'Monitoring and measuring resources', 'موارد الرقابة والقياس', 'Khayraadka la socodka iyo cabirka', 715),
('90010000-0000-0000-0000-000000007151', '90000000-0000-0000-0000-000000000001', '7.1.5.1', 'Généralités', 'General', 'عام', 'Guud', 7151),
('90010000-0000-0000-0000-000000007152', '90000000-0000-0000-0000-000000000001', '7.1.5.2', 'Traçabilité de la mesure', 'Measurement traceability', 'إمكانية تتبع القياس', 'La raacida cabirka', 7152),
('90010000-0000-0000-0000-000000000716', '90000000-0000-0000-0000-000000000001', '7.1.6', 'Connaissances de l''organisme', 'Organizational knowledge', 'معرفة المنظمة', 'Aqoonta hay''adda', 716),
('90010000-0000-0000-0000-000000000072', '90000000-0000-0000-0000-000000000001', '7.2', 'Compétences', 'Competence', 'الكفاءة', 'Xirfadda', 72),
('90010000-0000-0000-0000-000000000073', '90000000-0000-0000-0000-000000000001', '7.3', 'Sensibilisation', 'Awareness', 'الوعي', 'Ogaanshaha', 73),
('90010000-0000-0000-0000-000000000074', '90000000-0000-0000-0000-000000000001', '7.4', 'Communication', 'Communication', 'التواصل', 'Isgaarsiinta', 74),
('90010000-0000-0000-0000-000000000075', '90000000-0000-0000-0000-000000000001', '7.5', 'Informations documentées', 'Documented information', 'المعلومات الموثقة', 'Macluumaadka dukumiintiga ah', 75),
('90010000-0000-0000-0000-000000000751', '90000000-0000-0000-0000-000000000001', '7.5.1', 'Généralités', 'General', 'عام', 'Guud', 751),
('90010000-0000-0000-0000-000000000752', '90000000-0000-0000-0000-000000000001', '7.5.2', 'Création et mise à jour', 'Creating and updating', 'الإنشاء والتحديث', 'Abuurka iyo cusboonaysiinta', 752),
('90010000-0000-0000-0000-000000000753', '90000000-0000-0000-0000-000000000001', '7.5.3', 'Maîtrise des informations documentées', 'Control of documented information', 'ضبط المعلومات الموثقة', 'Maamulka macluumaadka dukumiintiga ah', 753);

-- Chapter 8: Réalisation
insert into public.clauses (id, standard_id, number, title, title_en, title_ar, title_so, sort_order) values
('90010000-0000-0000-0000-000000000008', '90000000-0000-0000-0000-000000000001', '8', 'Réalisation des activités opérationnelles', 'Operation', 'تنفيذ الأنشطة التشغيلية', 'Fulinta hawlaha shaqada', 8),
('90010000-0000-0000-0000-000000000081', '90000000-0000-0000-0000-000000000001', '8.1', 'Maîtrise opérationnelle et planification', 'Operational planning and control', 'التخطيط والضبط التشغيلي', 'Qorshaynta iyo maamulka shaqada', 81),
('90010000-0000-0000-0000-000000000082', '90000000-0000-0000-0000-000000000001', '8.2', 'Exigences relatives aux produits et services', 'Requirements for products and services', 'متطلبات المنتجات والخدمات', 'Baahiyaha alaabta iyo adeegyada', 82),
('90010000-0000-0000-0000-000000000821', '90000000-0000-0000-0000-000000000001', '8.2.1', 'Communication avec les clients', 'Customer communication', 'التواصل مع العملاء', 'Isgaarsiinta macmiilasha', 821),
('90010000-0000-0000-0000-000000000822', '90000000-0000-0000-0000-000000000001', '8.2.2', 'Détermination des exigences relatives aux produits et services', 'Determining requirements for products and services', 'تحديد متطلبات المنتجات والخدمات', 'Go''aaminta baahiyaha alaabta iyo adeegyada', 822),
('90010000-0000-0000-0000-000000000823', '90000000-0000-0000-0000-000000000001', '8.2.3', 'Revue des exigences relatives aux produits et services', 'Review of requirements for products and services', 'مراجعة متطلبات المنتجات والخدمات', 'Dib-u-eegista baahiyaha alaabta iyo adeegyada', 823),
('90010000-0000-0000-0000-000000000824', '90000000-0000-0000-0000-000000000001', '8.2.4', 'Modifications des exigences relatives aux produits et services', 'Changes to requirements', 'تغييرات المتطلبات', 'Isbeddelka baahiyaha', 824),
('90010000-0000-0000-0000-000000000083', '90000000-0000-0000-0000-000000000001', '8.3', 'Conception et développement des produits et services', 'Design and development', 'تصميم وتطوير المنتجات والخدمات', 'Naqshadeynta iyo horumarinta alaabta iyo adeegyada', 83),
('90010000-0000-0000-0000-000000000831', '90000000-0000-0000-0000-000000000001', '8.3.1', 'Généralités', 'General', 'عام', 'Guud', 831),
('90010000-0000-0000-0000-000000000832', '90000000-0000-0000-0000-000000000001', '8.3.2', 'Entrées de conception et développement', 'Design and development inputs', 'مدخلات التصميم والتطوير', 'Gelitaanka naqshadeynta iyo horumarinta', 832),
('90010000-0000-0000-0000-000000000833', '90000000-0000-0000-0000-000000000001', '8.3.3', 'Contrôles de conception et développement', 'Design and development controls', 'ضوابط التصميم والتطوير', 'Maamulka naqshadeynta iyo horumarinta', 833),
('90010000-0000-0000-0000-000000000834', '90000000-0000-0000-0000-000000000001', '8.3.4', 'Sorties de conception et développement', 'Design and development outputs', 'مخرجات التصميم والتطوير', 'Bixinta naqshadeynta iyo horumarinta', 834),
('90010000-0000-0000-0000-000000000835', '90000000-0000-0000-0000-000000000001', '8.3.5', 'Modifications de conception et développement', 'Design and development changes', 'تغييرات التصميم والتطوير', 'Isbeddelka naqshadeynta iyo horumarinta', 835),
('90010000-0000-0000-0000-000000000084', '90000000-0000-0000-0000-000000000001', '8.4', 'Maîtrise des processus, produits et services fournis par des prestataires externes', 'Control of externally provided processes, products and services', 'ضبط العمليات والمنتجات والخدمات المقدمة من موردين خارجيين', 'Maamulka habraacyada, alaabta iyo adeegyada la bixiyo dhinacyada dibadda', 84),
('90010000-0000-0000-0000-000000000841', '90000000-0000-0000-0000-000000000001', '8.4.1', 'Généralités', 'General', 'عام', 'Guud', 841),
('90010000-0000-0000-0000-000000000842', '90000000-0000-0000-0000-000000000001', '8.4.2', 'Type et étendue de la maîtrise', 'Type and extent of control', 'نوع ومجال الضبط', 'Nooca iyo qiyaasta maamulka', 842),
('90010000-0000-0000-0000-000000000843', '90000000-0000-0000-0000-000000000001', '8.4.3', 'Informations pour les prestataires externes', 'Information for external providers', 'معلومات للموردين الخارجيين', 'Macluumaad dhinacyada dibadda', 843),
('90010000-0000-0000-0000-000000000085', '90000000-0000-0000-0000-000000000001', '8.5', 'Production et prestation de service', 'Production and service provision', 'الإنتاج وتقديم الخدمة', 'Wax-soo-saarka iyo bixinta adeegga', 85),
('90010000-0000-0000-0000-000000000851', '90000000-0000-0000-0000-000000000001', '8.5.1', 'Maîtrise de la production et de la prestation de service', 'Control of production and service provision', 'ضبط الإنتاج وتقديم الخدمة', 'Maamulka wax-soo-saarka iyo bixinta adeegga', 851),
('90010000-0000-0000-0000-000000000852', '90000000-0000-0000-0000-000000000001', '8.5.2', 'Identification et traçabilité', 'Identification and traceability', 'التحديد وإمكانية التتبع', 'Aqoonsiga iyo la raacida', 852),
('90010000-0000-0000-0000-000000000853', '90000000-0000-0000-0000-000000000001', '8.5.3', 'Propriété appartenant à des clients ou prestataires externes', 'Property belonging to customers or external providers', 'ملكية العملاء أو الموردين الخارجيين', 'Milkiga macmiilasha ama dhinacyada dibadda', 853),
('90010000-0000-0000-0000-000000000854', '90000000-0000-0000-0000-000000000001', '8.5.4', 'Préservation', 'Preservation', 'الحفظ', 'Ilalinta', 854),
('90010000-0000-0000-0000-000000000855', '90000000-0000-0000-0000-000000000001', '8.5.5', 'Livraison post-livraison', 'Post-delivery activities', 'أنشطة ما بعد التسليم', 'Hawlgallo ka dib gudbinta', 855),
('90010000-0000-0000-0000-000000000856', '90000000-0000-0000-0000-000000000001', '8.5.6', 'Maîtrise des modifications', 'Control of changes', 'ضبط التغييرات', 'Maamulka isbeddelka', 856),
('90010000-0000-0000-0000-000000000086', '90000000-0000-0000-0000-000000000001', '8.6', 'Libération des produits et services', 'Release of products and services', 'إطلاق المنتجات والخدمات', 'Soo saarista alaabta iyo adeegyada', 86),
('90010000-0000-0000-0000-000000000087', '90000000-0000-0000-0000-000000000001', '8.7', 'Maîtrise des sorties de processus, produits et services non conformes', 'Control of nonconforming outputs', 'ضبط المخرجات غير المطابقة', 'Maamulka wax-soo-saarka aan la mid ahayn', 87);

-- Chapter 9: Évaluation des performances
insert into public.clauses (id, standard_id, number, title, title_en, title_ar, title_so, sort_order) values
('90010000-0000-0000-0000-000000000009', '90000000-0000-0000-0000-000000000001', '9', 'Évaluation des performances', 'Performance evaluation', 'تقييم الأداء', 'Qiimaynta waxqabadka', 9),
('90010000-0000-0000-0000-000000000091', '90000000-0000-0000-0000-000000000001', '9.1', 'Surveillance, mesure, analyse et évaluation', 'Monitoring, measurement, analysis and evaluation', 'الرقابة والقياس والتحليل والتقييم', 'Socodka, cabirka, falanqaynta iyo qiimaynta', 91),
('90010000-0000-0000-0000-000000000911', '90000000-0000-0000-0000-000000000001', '9.1.1', 'Généralités', 'General', 'عام', 'Guud', 911),
('90010000-0000-0000-0000-000000000912', '90000000-0000-0000-0000-000000000001', '9.1.2', 'Satisfaction du client', 'Customer satisfaction', 'رضا العملاء', 'Qancinimada macmiilka', 912),
('90010000-0000-0000-0000-000000000913', '90000000-0000-0000-0000-000000000001', '9.1.3', 'Analyse et évaluation', 'Analysis and evaluation', 'التحليل والتقييم', 'Falanqaynta iyo qiimaynta', 913),
('90010000-0000-0000-0000-000000000092', '90000000-0000-0000-0000-000000000001', '9.2', 'Audit interne', 'Internal audit', 'التدقيق الداخلي', 'Baarista gudaha', 92),
('90010000-0000-0000-0000-000000000921', '90000000-0000-0000-0000-000000000001', '9.2.1', 'Généralités', 'General', 'عام', 'Guud', 921),
('90010000-0000-0000-0000-000000000922', '90000000-0000-0000-0000-000000000001', '9.2.2', 'Programme d''audit interne', 'Internal audit programme', 'برنامج التدقيق الداخلي', 'Barnaamijka baarista gudaha', 922),
('90010000-0000-0000-0000-000000000093', '90000000-0000-0000-0000-000000000001', '9.3', 'Revue de direction', 'Management review', 'مراجعة الإدارة', 'Dib-u-eegista maamulka', 93),
('90010000-0000-0000-0000-000000000931', '90000000-0000-0000-0000-000000000001', '9.3.1', 'Généralités', 'General', 'عام', 'Guud', 931),
('90010000-0000-0000-0000-000000000932', '90000000-0000-0000-0000-000000000001', '9.3.2', 'Entrées de la revue de direction', 'Management review inputs', 'مدخلات مراجعة الإدارة', 'Gelitaanka dib-u-eegista maamulka', 932),
('90010000-0000-0000-0000-000000000933', '90000000-0000-0000-0000-000000000001', '9.3.3', 'Sorties de la revue de direction', 'Management review outputs', 'مخرجات مراجعة الإدارة', 'Bixinta dib-u-eegista maamulka', 933);

-- Chapter 10: Amélioration
insert into public.clauses (id, standard_id, number, title, title_en, title_ar, title_so, sort_order) values
('90010000-0000-0000-0000-000000000010', '90000000-0000-0000-0000-000000000001', '10', 'Amélioration', 'Improvement', 'التحسين', 'Hagaajinta', 10),
('90010000-0000-0000-0000-000000000101', '90000000-0000-0000-0000-000000000001', '10.1', 'Généralités', 'General', 'عام', 'Guud', 101),
('90010000-0000-0000-0000-000000000102', '90000000-0000-0000-0000-000000000001', '10.2', 'Non-conformité et actions correctives', 'Nonconformity and corrective action', 'عدم المطابقة والإجراءات التصحيحية', 'Khaladka iyo hawlgalka saxda ah', 102),
('90010000-0000-0000-0000-000000000103', '90000000-0000-0000-0000-000000000001', '10.3', 'Amélioration continue', 'Continual improvement', 'التحسين المستمر', 'Hagaajinta sii socda', 103);

-- ============================================================================
-- REQUIREMENTS (atomic, with 3 explanation levels)
-- ============================================================================

-- 4.1 Compréhension de l'organisme et de son contexte
insert into public.requirements (clause_id, code, statement, statement_en, statement_ar, statement_so,
  explain_novice, explain_intermediate, explain_expert,
  expected_evidence, default_period, default_role, is_mandatory_doc, is_mandatory_record, sort_order)
values
('90010000-0000-0000-0000-000000000041', '9001-4.1-a',
 'Identifier les enjeux internes et externes pertinents pour le SMQ',
 'Identify internal and external issues relevant to the QMS',
 'تحديد القضايا الداخلية والخارجية ذات الصلة بنظام إدارة الجودة',
 'Aqoonsiga arrimaha gudaha iyo dibadda ee la xidhiidha SMQ',
 'Faites une liste simple de ce qui peut aider ou gêner votre entreprise pour la qualité (ex: concurrence, réglementation, climat).',
 'Réalisez une analyse SWOT ou PESTEL pour cartographier les facteurs internes (culture, ressources) et externes (marché, lois, technologie) qui influencent la capacité à atteindre les objectifs qualité.',
 'Documentez une analyse stratégique du contexte intégrant les parties intéressées, les risques systémiques et les scénarios d''évolution, revue annuelle avec traçabilité des décisions.',
 '["SWOT ou analyse de contexte", "Revue périodique du contexte"]', '1 year', 'quality_manager', false, true, 1),

('90010000-0000-0000-0000-000000000041', '9001-4.1-b',
 'Surveiller et réviser les enjeux internes et externes',
 'Monitor and review internal and external issues',
 'مراقبة ومراجعة القضايا الداخلية والخارجية',
 'Socod iyo dib-u-eegis arrimaha gudaha iyo dibadda',
 'Vérifiez au moins une fois par an si votre liste des enjeux est toujours valable.',
 'Planifiez une revue annuelle du contexte avec mise à jour du SWOT et analyse d''impact sur les objectifs.',
 'Intégrez la revue du contexte dans la revue de direction avec analyse de tendances et ajustement stratégique.',
 '["Compte-rendu de revue du contexte"]', '1 year', 'quality_manager', false, true, 2),

-- 4.2 Parties intéressées
('90010000-0000-0000-0000-000000000042', '9001-4.2-a',
 'Identifier les parties intéressées pertinentes pour le SMQ',
 'Identify interested parties relevant to the QMS',
 'تحديد الأطراف المعنية بنظام إدارة الجودة',
 'Aqoonsiga dhinacyada xiisaynaya ee la xidhiidha SMQ',
 'Faites la liste de qui compte pour votre entreprise : clients, employés, fournisseurs, autorités, banques.',
 'Cartographiez les parties intéressées avec leurs attentes, leur influence et leur criticité pour le SMQ.',
 'Réalisez une matrice de parties intéressées avec analyse de pouvoir/intérêt, plan de communication différencié et revue périodique.',
 '["Registre des parties intéressées", "Matrice des attentes"]', '1 year', 'quality_manager', false, true, 1),

('90010000-0000-0000-0000-000000000042', '9001-4.2-b',
 'Déterminer les exigences de ces parties intéressées',
 'Determine requirements of these interested parties',
 'تحديد متطلبات هذه الأطراف المعنية',
 'Go''aaminta baahiyaha dhinacyada xiisaynaya',
 'Pour chaque partie, notez ce qu''elle attend de vous.',
 'Analysez et priorisez les exigences, distinguez les exigences légales/réglementaires des attentes de marché.',
 'Cartographiez les exigences avec leur source, leur statut (obligatoire/conventionnel), leur impact et leur mode de surveillance.',
 '["Liste des exigences des parties intéressées"]', '1 year', 'quality_manager', false, true, 2),

-- 4.3 Périmètre du SMQ (DOCUMENT OBLIGATOIRE)
('90010000-0000-0000-0000-000000000043', '9001-4.3-a',
 'Déterminer le périmètre du système de management de la qualité',
 'Determine the scope of the QMS',
 'تحديد نطاق نظام إدارة الجودة',
 'Go''aaminta ujeedada nidaamka maamulka tayada',
 'Écrivez en une phrase ce que votre entreprise fait et quels sites sont concernés par la certification.',
 'Définissez formellement le périmètre : produits/services, sites, exclusions (avec justification), disponibilité des ressources.',
 'Documentez le périmètre avec analyse de justification des exclusions (clause 8), alignment avec la stratégie et les enjeux du contexte, revue lors de tout changement structurel.',
 '["Déclaration de périmètre du SMQ (document obligatoire)"]', '1 year', 'quality_manager', true, true, 1),

-- 4.4 SMQ et ses processus
('90010000-0000-0000-0000-000000000044', '9001-4.4-a',
 'Déterminer les processus nécessaires pour le SMQ et leurs applications',
 'Determine processes needed for the QMS and their application',
 'تحديد العمليات اللازمة لنظام إدارة الجودة وتطبيقاتها',
 'Go''aaminta habraacyada lagama maarmaanka u ah SMQ',
 'Faites la liste de vos grandes activités : ventes, production, achats, RH, qualité.',
 'Cartographiez les processus avec leurs intrants, extrants, pilotes et interactions (cartographie SIPOC).',
 'Modélisez l''architecture des processus avec les interfaces, les indicateurs d''efficacité et la logique d''amélioration (approche processus systémique).',
 '["Cartographie des processus (SIPOC)", "Fiches de processus"]', '1 year', 'quality_manager', false, true, 1),

('90010000-0000-0000-0000-000000000044', '9001-4.4-b',
 'Déterminer la séquence et l''interaction des processus',
 'Determine sequence and interaction of processes',
 'تحديد تسلسل وتفاعل العمليات',
 'Go''aaminta isku xigxiga iyo isdhexgalka habraacyada',
 'Montrez par un schéma simple comment vos processus s''enchaînent.',
 'Établissez un logigramme des processus montrant les flux d''entrées/sorties et les points de décision.',
 'Modélisez les interactions avec une vue dynamique (processus de réalisation vs processus support vs processus management).',
 '["Schéma des interactions de processus"]', '1 year', 'quality_manager', false, true, 2),

('90010000-0000-0000-0000-000000000044', '9001-4.4-c',
 'Déterminer les critères et méthodes pour assurer l''efficacité des processus',
 'Determine criteria and methods to ensure process effectiveness',
 'تحديد معايير وطرق ضمان فعالية العمليات',
 'Go''aaminta shuruudaha iyo hababka lagu hubinayo waxtarka habraacyada',
 'Pour chaque processus, définissez comment vous savez s''il fonctionne bien (ex: délai respecté, zéro erreur).',
 'Définissez des indicateurs de performance (KPI) par processus avec cibles, fréquence de mesure et seuils d''alerte.',
 'Établissez un tableau de bord processus avec KPIs leading et lagging, analyse de variance et plan d''action en cas de dérive.',
 '["Indicateurs de processus (KPI)", "Tableau de bord"]', '3 months', 'process_owner', false, true, 3),

('90010000-0000-0000-0000-000000000044', '9001-4.4-d',
 'Surveiller, mesurer et analyser les processus',
 'Monitor, measure and analyze processes',
 'مراقبة وقياس وتحليل العمليات',
 'Socod, cabir iyo falanqayn habraacyada',
 'Notez régulièrement les résultats de vos indicateurs.',
 'Mettez en place un suivi périodique des KPI avec analyse des écarts et actions correctives.',
 'Réalisez une analyse statistique des performances processus avec contrôle de variabilité et root cause analysis des dérives.',
 '["Résultats de surveillance des processus"]', '1 month', 'process_owner', false, true, 4),

-- 5.1.1 Leadership et engagement
('90010000-0000-0000-0000-000000000511', '9001-5.1.1-a',
 'Démontrer l''engagement de la direction envers le SMQ',
 'Demonstrate top management commitment to the QMS',
 'إظهار التزام الإدارة بنظام إدارة الجودة',
 'Muuqaal xilka maamulka ee SMQ',
 'Le dirigeant doit montrer qu''il soutient la qualité, par exemple en participant aux revues et en donnant des ressources.',
 'La direction doit rendre des comptes sur l''efficacité du SMQ, assurer l''alignement stratégique et promouvoir l''approche processus.',
 'La direction intègre la qualité dans la gouvernance, alloue les ressources stratégiques et pilote l''amélioration par les données.',
 '["Preuves de participation de la direction (revues, décisions)"]', '1 year', 'director', false, true, 1),

-- 5.1.2 Orientation client
('90010000-0000-0000-0000-000000000512', '9001-5.1.2-a',
 'Assurer la satisfaction des exigences client',
 'Ensure customer requirements are met',
 'ضمان تلبية متطلبات العملاء',
 'Hubinta baahiyaha macmiilka la qanciyo',
 'Assurez-vous que vos clients reçoivent ce qu''ils ont demandé.',
 'Mettez en place un processus de mesure de la satisfaction client et d''analyse des réclamations.',
 'Intégrez la voix du client (VOC) dans la conception, mesurez le NPS, l''indice de satisfaction et le taux de réclamation.',
 '["Enquêtes de satisfaction", "Analyse des réclamations"]', '6 months', 'quality_manager', false, true, 1),

-- 5.2 Politique qualité (DOCUMENT OBLIGATOIRE)
('90010000-0000-0000-0000-000000000521', '9001-5.2.1-a',
 'Établir une politique qualité',
 'Establish a quality policy',
 'وضع سياسة الجودة',
 'Dajinta siyaasadda tayada',
 'Écrivez une page qui dit pourquoi la qualité est importante pour vous et ce que vous voulez atteindre.',
 'Rédigez une politique alignée avec la stratégie, incluant l''engagement à satisfaire les exigences et à améliorer le SMQ.',
 'La politique est un document stratégique intégrant le contexte, les parties intéressées, les orientations et les principes d''action.',
 '["Politique qualité (document obligatoire)"]', '1 year', 'director', true, true, 1),

('90010000-0000-0000-0000-000000000522', '9001-5.2.2-a',
 'Communiquer la politique qualité',
 'Communicate the quality policy',
 'تواصل سياسة الجودة',
 'Gudbinta siyaasadda tayada',
 'Affichez la politique qualité où tout le monde peut la voir.',
 'Diffusez la politique à tous les niveaux avec accusés de lecture et sensibilisation.',
 'Communiquez la politique avec un plan de communication multi-canal, mesure de compréhension et intégration dans les entretiens individuels.',
 '["Preuves de communication de la politique (accusés de lecture)"]', '1 year', 'quality_manager', false, true, 1),

-- 5.3 Rôles et responsabilités
('90010000-0000-0000-0000-000000000053', '9001-5.3-a',
 'Assigner et communiquer les rôles et responsabilités',
 'Assign and communicate roles and responsibilities',
 'تعيين وتوصيل الأدوار والمسؤوليات',
 'Magacaabida iyo gudbinta hannaanka iyo mas''uuliyadda',
 'Dites à chacun ce qu''il doit faire pour la qualité.',
 'Définissez formellement les rôles qualité par processus avec description de poste et matrice RACI.',
 'Établissez une gouvernance qualité avec matrice RACI, délégations formelles et revue d''efficacité organisationnelle.',
 '["Organigramme", "Fiches de poste avec responsabilités qualité"]', '1 year', 'tenant_admin', false, true, 1),

-- 6.1 Risques et opportunités
('90010000-0000-0000-0000-000000000061', '9001-6.1-a',
 'Déterminer les risques et opportunités',
 'Determine risks and opportunities',
 'تحديد المخاطر والفرص',
 'Go''aaminta khataraha iyo fursadaha',
 'Faites une liste de ce qui pourrait mal se passer et de ce qui pourrait vous aider.',
 'Réalisez une analyse de risques par processus avec cotation (gravité × probabilité) et plan de traitement.',
 'Mettez en place un registre de risques intégré avec la stratégie, analyse FMEA, carte de chaleur et revue trimestrielle.',
 '["Registre des risques et opportunités", "Plan de traitement des risques"]', '6 months', 'quality_manager', false, true, 1),

('90010000-0000-0000-0000-000000000061', '9001-6.1-b',
 'Planifier et mettre en œuvre des actions pour traiter les risques',
 'Plan and implement actions to address risks',
 'تخطيط وتنفيذ إجراءات لمعالجة المخاطر',
 'Qorshayn iyo fulin hawlgallo ka jawaabidda khataraha',
 'Pour chaque risque important, décidez ce que vous allez faire pour l''éviter ou le réduire.',
 'Définissez des actions de traitement avec responsable, échéance et critère d''efficacité.',
 'Intégrez la gestion des risques dans le pilotage opérationnel avec suivi des indicateurs de contrôle et réévaluation périodique.',
 '["Actions de traitement des risques avec suivi"]', '3 months', 'quality_manager', false, true, 2),

-- 6.2 Objectifs qualité (DOCUMENT OBLIGATOIRE)
('90010000-0000-0000-0000-000000000621', '9001-6.2.1-a',
 'Établir des objectifs qualité mesurables',
 'Establish measurable quality objectives',
 'وضع أهداف جودة قابلة للقياس',
 'Dajinta hadda tayada la cabiri karo',
 'Fixez 3 à 5 objectifs simples, par exemple « réduire les retards de 20% ».',
 'Définissez des objectifs SMART par processus, alignés avec la politique et le contexte.',
 'Établissez une cascade d''objectifs du stratégique à l''opérationnel avec indicateurs leading/lagging et alignment stratégique.',
 '["Objectifs qualité (document obligatoire)"]', '1 year', 'director', true, true, 1),

('90010000-0000-0000-0000-000000000622', '9001-6.2.2-a',
 'Planifier comment atteindre les objectifs qualité',
 'Plan how to achieve quality objectives',
 'تخطيط كيفية تحقيق أهداف الجودة',
 'Qorshayn sida loo gaadho hadda tayada',
 'Pour chaque objectif, dites qui le fait, quand, et comment vous saurez s''il est atteint.',
 'Définissez un plan d''action par objectif avec ressources, responsable, échéance et indicateurs de suivi.',
 'Établissez un déploiement d''objectifs avec roadmap, jalons, analyse de variance et ajustement dynamique.',
 '["Plan d''action pour les objectifs qualité"]', '3 months', 'quality_manager', false, true, 1),

-- 7.1.5 Étalonnage (ENREGISTREMENT OBLIGATOIRE)
('90010000-0000-0000-0000-000000007152', '9001-7.1.5.2-a',
 'Assurer la traçabilité de l''étalonnage des équipements de mesure',
 'Ensure measurement traceability (calibration)',
 'ضمان إمكانية تتبع المعايرة',
 'Hubinta la raacida cabirka qalabka cabirka',
 'Faites vérifier vos instruments de mesure (thermomètres, balances) par un laboratoire au moins une fois par an.',
 'Mettez en place un plan d''étalonnage avec certificats, identification des équipements et gestion des dérives.',
 'Gérez le parc métrologique avec analyse d''incertitude, étalonnage raccordé SI, gestion des non-conformités d''étalonnage et impact sur les mesures précédentes.',
 '["Certificats d''étalonnage (enregistrement obligatoire)", "Plan d''étalonnage"]', '1 year', 'quality_manager', false, true, 1),

-- 7.2 Compétences (ENREGISTREMENT OBLIGATOIRE)
('90010000-0000-0000-0000-000000000072', '9001-7.2-a',
 'Déterminer les compétences nécessaires',
 'Determine necessary competence',
 'تحديد الكفاءات اللازمة',
 'Go''aaminta xirfadaha lagama maarmaanka ah',
 'Faites la liste des compétences dont votre équipe a besoin pour faire son travail.',
 'Établissez une matrice de compétences par poste avec niveaux requis et écarts.',
 'Réalisez une cartographie des compétences critiques avec analyse de risques de perte de compétence et plan de succession.',
 '["Matrice de compétences (enregistrement obligatoire)"]', '1 year', 'quality_manager', false, true, 1),

('90010000-0000-0000-0000-000000000072', '9001-7.2-b',
 'S''assurer que les personnes sont compétentes',
 'Ensure people are competent',
 'ضمان كفاءة الأشخاص',
 'Hubinta dadka ay yihiin kuwo xirfad leh',
 'Vérifiez que vos employés ont les diplômes ou formations nécessaires.',
 'Mettez en place un processus d''évaluation des compétences avec preuves (diplômes, certifications, évaluations).',
 'Établissez un système de gestion des compétences avec évaluation 360°, validation par l''expérience et veille de développement.',
 '["Preuves de compétence (diplômes, attestations, évaluations)"]', '1 year', 'quality_manager', false, true, 2),

-- 7.3 Sensibilisation
('90010000-0000-0000-0000-000000000073', '9001-7.3-a',
 'Sensibiliser le personnel à la politique et aux objectifs qualité',
 'Make personnel aware of quality policy and objectives',
 'توعية الموظفين بسياسة وأهداف الجودة',
 'Ogaadhsiinta shaqaalaha siyaasadda iyo hadda tayada',
 'Assurez-vous que tout le monde connaît la politique qualité et les objectifs.',
 'Mettez en place des sessions de sensibilisation avec accusés de participation et quiz de compréhension.',
 'Intégrez la sensibilisation qualité dans le parcours employé avec micro-learning continu et mesure d''impact.',
 '["Preuves de sensibilisation (accusés, quiz)"]', '1 year', 'quality_manager', false, true, 1),

-- 7.4 Communication
('90010000-0000-0000-0000-000000000074', '9001-7.4-a',
 'Déterminer les communications relatives au SMQ',
 'Determine QMS-related communications',
 'تحديد التواصل المتعلق بنظام إدارة الجودة',
 'Go''aaminta isgaarsiinta la xidhiidha SMQ',
 'Décidez qui dit quoi, quand et comment pour la qualité.',
 'Établissez un plan de communication interne et externe avec canaux, fréquences et responsabilités.',
 'Mettez en place une stratégie de communication qualité avec segmentation des audiences et mesure d''efficacité.',
 '["Plan de communication qualité"]', '1 year', 'quality_manager', false, true, 1),

-- 7.5 Informations documentées
('90010000-0000-0000-0000-000000000753', '9001-7.5.3-a',
 'Maîtriser la création, la mise à jour et le contrôle des informations documentées',
 'Control creation, update and control of documented information',
 'ضبط إنشاء وتحديث ومراقبة المعلومات الموثقة',
 'Maamulka abuurka, cusboonaysiinta iyo kontorolka macluumaadka dukumiintiga ah',
 'Assurez-vous que vos documents sont à jour, validés et que les anciennes versions sont retirées.',
 'Mettez en place un système de gestion documentaire avec codification, versions, approbations, diffusion et archivage.',
 'Établissez un système documentaire intégré avec workflow électronique, traçabilité complète et analyse du cycle de vie documentaire.',
 '["Procédure de maîtrise documentaire", "Liste des documents contrôlés"]', '1 year', 'quality_manager', false, true, 1),

-- 8.2.3 Revue des exigences (ENREGISTREMENT OBLIGATOIRE)
('90010000-0000-0000-0000-000000000823', '9001-8.2.3-a',
 'Revoir les exigences avant de s''engager envers le client',
 'Review requirements before committing to customer',
 'مراجعة المتطلبات قبل الالتزام تجاه العميل',
 'Dib-u-eegista baahiyaha ka hor inta aadan u xirxin macmiilka',
 'Avant d''accepter une commande, vérifiez que vous pouvez la faire.',
 'Mettez en place une revue de commande avec vérification des capacités, des exigences et des risques.',
 'Établissez un processus de revue de contrat avec analyse de risques, capacité et alignment stratégique.',
 '["Enregistrements de revue de commande (enregistrement obligatoire)"]', '1 month', 'process_owner', false, true, 1),

-- 8.4.1 Critères de sélection fournisseurs (DOCUMENT OBLIGATOIRE)
('90010000-0000-0000-0000-000000000841', '9001-8.4.1-a',
 'Définir des critères de sélection et d''évaluation des fournisseurs',
 'Define criteria for supplier selection and evaluation',
 'تحديد معايير اختيار وتقييم الموردين',
 'Dajinta shuruudaha doorashada iyo qiimaynta beeyada',
 'Écrivez ce que vous exigez de vos fournisseurs (qualité, délai, prix).',
 'Établissez des critères formels avec pondération, processus d''audit et scorecard.',
 'Mettez en place un système de gestion des fournisseurs avec analyse de risques, audit, développement et KPIs.',
 '["Critères de sélection des fournisseurs (document obligatoire)"]', '1 year', 'quality_manager', true, true, 1),

-- 8.5.1 Maîtrise de la production
('90010000-0000-0000-0000-000000000851', '9001-8.5.1-a',
 'Maîtriser les conditions de production et de prestation de service',
 'Control production and service provision conditions',
 'ضبط ظروف الإنتاج وتقديم الخدمة',
 'Maamulka shuruudaha wax-soo-saarka iyo bixinta adeegga',
 'Assurez-vous que les bonnes personnes ont les bonnes instructions et le bon matériel.',
 'Mettez en place des instructions de travail, des paramètres contrôlés et des vérifications en cours de processus.',
 'Établissez un contrôle de processus avec SPC, analyse de capabilité et pilotage par les données temps réel.',
 '["Instructions de travail", "Paramètres de production contrôlés"]', '1 month', 'process_owner', false, true, 1),

-- 8.5.2 Identification et traçabilité
('90010000-0000-0000-0000-000000000852', '9001-8.5.2-a',
 'Assurer l''identification et la traçabilité des produits',
 'Ensure product identification and traceability',
 'ضمان تحديد وتتبع المنتجات',
 'Hubinta aqoonsiga iyo la raacida alaabta',
 'Assurez-vous de pouvoir retrouver d''où vient chaque produit.',
 'Mettez en place un système de traçabilité avec numéros de lot et enregistrements.',
 'Établissez un système de traçabilité bidirectionnel complet avec gestion électronique des lots et capacité de rappel.',
 '["Enregistrements de traçabilité (lots)"]', '1 month', 'process_owner', false, true, 1),

-- 8.6 Libération des produits (ENREGISTREMENT OBLIGATOIRE)
('90010000-0000-0000-0000-000000000086', '9001-8.6-a',
 'Vérifier la conformité avant la libération des produits et services',
 'Verify conformity before release of products and services',
 'التحقق من المطابقة قبل إطلاق المنتجات والخدمات',
 'Xaqiijinta waafaqsanaanta ka hor inta aadan soo saarin alaabta iyo adeegyada',
 'Avant de livrer, vérifiez que le produit est conforme.',
 'Mettez en place un contrôle final avec critères d''acceptation et enregistrement des résultats.',
 'Établissez un processus de libération avec inspection statistique, analyse de capabilité et traçabilité complète.',
 '["Enregistrements de libération (enregistrement obligatoire)"]', '1 month', 'process_owner', false, true, 1),

-- 8.7 Produits non conformes (ENREGISTREMENT OBLIGATOIRE)
('90010000-0000-0000-0000-000000000087', '9001-8.7-a',
 'Identifier et maîtriser les sorties non conformes',
 'Identify and control nonconforming outputs',
 'تحديد وضبط المخرجات غير المطابقة',
 'Aqoonsiga iyo maamulka wax-soo-saarka aan la mid ahayn',
 'Quand un produit n''est pas conforme, ne le livrez pas et notez-le.',
 'Mettez en place un processus de traitement des non-conformités avec ségrégation, décision et enregistrement.',
 'Établissez un système de gestion des NC avec analyse de causes, actions correctives et mesure d''efficacité.',
 '["Enregistrements de non-conformité (enregistrement obligatoire)"]', '1 month', 'quality_manager', false, true, 1),

-- 9.1.2 Satisfaction client
('90010000-0000-0000-0000-000000000912', '9001-9.1.2-a',
 'Surveiller la satisfaction du client',
 'Monitor customer satisfaction',
 'مراقبة رضا العملاء',
 'Socod qancinimada macmiilka',
 'Demandez à vos clients s''ils sont satisfaits.',
 'Mettez en place des enquêtes de satisfaction avec analyse des résultats et plan d''action.',
 'Établissez un système VOC multi-canal avec NPS, CSAT, analyse de sentiment et intégration dans le pilotage.',
 '["Résultats d''enquêtes de satisfaction"]', '6 months', 'quality_manager', false, true, 1),

-- 9.2 Audit interne (ENREGISTREMENT OBLIGATOIRE)
('90010000-0000-0000-0000-000000000922', '9001-9.2.2-a',
 'Établir un programme d''audit interne',
 'Establish an internal audit programme',
 'وضع برنامج التدقيق الداخلي',
 'Dajinta barnaamijka baarista gudaha',
 'Planifiez des audits pour vérifier que votre système qualité fonctionne.',
 'Établissez un programme pluriannuel basé sur les risques, avec auditeurs formés et indépendants.',
 'Mettez en place un programme d''audit basé sur le risque avec analyse de tendance et couverture systémique.',
 '["Programme d''audit interne (enregistrement obligatoire)"]', '1 year', 'quality_manager', false, true, 1),

('90010000-0000-0000-0000-000000000922', '9001-9.2.2-b',
 'Réaliser les audits internes et enregistrer les résultats',
 'Conduct internal audits and record results',
 'تنفيذ التدقيقات الداخلية وتسجيل النتائج',
 'Fulinta baarista gudaha iyo diiwaangelinta natiijooyinka',
 'Faites les audits prévus et notez ce que vous avez trouvé.',
 'Réalisez les audits avec check-lists, constats classés et rapport.',
 'Mettez en place un processus d''audit avec analyse systémique, identification de tendances et recommandations stratégiques.',
 '["Rapports d''audit interne (enregistrement obligatoire)"]', '1 year', 'internal_auditor', false, true, 2),

-- 9.3 Revue de direction (ENREGISTREMENT OBLIGATOIRE)
('90010000-0000-0000-0000-000000000931', '9001-9.3.1-a',
 'Réaliser une revue de direction au moins une fois par an',
 'Conduct management review at least annually',
 'إجراء مراجعة الإدارة مرة واحدة على الأقل سنوياً',
 'Sameynta dib-u-eegis maamul ah ugu yaraan sanad kii',
 'Le dirigeant doit au moins une fois par an faire le point sur la qualité.',
 'Planifiez et tenez une revue de direction avec les entrées exigées par 9.3.2 et les sorties exigées par 9.3.3.',
 'Intégrez la revue de direction dans la gouvernance stratégique avec analyse de tendance pluriannuelle et pilotage par les données.',
 '["Compte-rendu de revue de direction (enregistrement obligatoire)"]', '1 year', 'director', false, true, 1),

-- 10.2 Non-conformité et actions correctives (ENREGISTREMENT OBLIGATOIRE)
('90010000-0000-0000-0000-000000000102', '9001-10.2-a',
 'Réagir aux non-conformités et mettre en œuvre des actions correctives',
 'React to nonconformities and implement corrective actions',
 'التفاعل مع عدم المطابقة وتنفيذ الإجراءات التصحيحية',
 'Ka jawaabidda khaladaadka iyo fulinta hawlgallo saxda ah',
 'Quand quelque chose ne va pas, corrigez-le et cherchez pourquoi c''est arrivé.',
 'Mettez en place un processus CAPA avec analyse de causes (5 Pourquoi, Ishikawa) et vérification d''efficacité.',
 'Établissez un système CAPA intégré avec analyse systémique des causes racines, actions préventives et mesure d''efficacité différée.',
 '["Enregistrements d''actions correctives (enregistrement obligatoire)"]', '3 months', 'quality_manager', false, true, 1);

-- ============================================================================
-- ROADMAP TEMPLATE: ISO 9001 for TPE
-- ============================================================================

insert into public.roadmap_templates (id, standard_id, size_band, sector, name) values
('rm-tpl-9001-tpe-001', '90000000-0000-0000-0000-000000000001', 'tpe', null, 'Implémentation ISO 9001 pour TPE (100 jours)')
on conflict do nothing;

insert into public.roadmap_steps (template_id, sort_order, title, title_en, title_ar, title_so, description, week_offset, deliverable_type) values
('rm-tpl-9001-tpe-001', 1, 'Sensibilisation et engagement direction', 'Awareness and management commitment', 'التوعية والتزام الإدارة', 'Ogaanshaha iyo xilka maamulka', 'Sensibiliser l''équipe à la qualité et obtenir l''engagement formel du dirigeant', 0, 'document'),
('rm-tpl-9001-tpe-001', 2, 'Revue des processus et analyse d''écarts', 'Process review and gap analysis', 'مراجعة العمليات وتحليل الفجوات', 'Dib-u-eegista habraacyada iyo falanqaynta caqabadaha', 'Cartographier les processus existants et identifier les écarts avec la norme', 2, 'record'),
('rm-tpl-9001-tpe-001', 3, 'Conception des processus', 'Process design', 'تصميم العمليات', 'Naqshadeynta habraacyada', 'Définir ou formaliser les processus, pilotes et indicateurs', 4, 'document'),
('rm-tpl-9001-tpe-001', 4, 'Documentation du système', 'System documentation', 'توثيق النظام', 'Dukumiinti nidaamka', 'Rédiger la politique, les procédures et les enregistrements obligatoires', 6, 'document'),
('rm-tpl-9001-tpe-001', 5, 'Mise en service', 'Deployment', 'التشغيل', 'Bilaabista shaqada', 'Déployer les processus documentés et former le personnel', 8, 'training'),
('rm-tpl-9001-tpe-001', 6, 'Formation des auditeurs internes', 'Internal auditor training', 'تدريب المدققين الداخليين', 'Tababarka baarayaasha gudaha', 'Former 1 à 2 auditeurs internes (aligné sur ISO 19011)', 10, 'training'),
('rm-tpl-9001-tpe-001', 7, 'Premier audit interne', 'First internal audit', 'أول تدقيق داخلي', 'Baarista gudaha ee ugu horreysa', 'Réaliser le premier audit interne du SMQ', 12, 'audit'),
('rm-tpl-9001-tpe-001', 8, 'Pré-audit (optionnel)', 'Pre-audit (optional)', 'التدقيق المسبق (اختياري)', 'Baarista ka hor (ikhtiyaari)', 'Faire un pré-audit avec le certificateur ou un consultant', 14, 'audit'),
('rm-tpl-9001-tpe-001', 9, 'Clôture des écarts', 'Closing gaps', 'إغلاق الفجوات', 'Xiridda caqabadaha', 'Traiter les écarts identifiés lors du pré-audit', 15, 'action'),
('rm-tpl-9001-tpe-001', 10, 'Audit de certification', 'Certification audit', 'تدقيق الشهادة', 'Baarista shahaadada', 'Réussir l''audit de certification', 16, 'audit');
