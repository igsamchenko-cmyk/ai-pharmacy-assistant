/**
 * Ingredient seed for the Drug Dictionary.
 *
 * Each row is one active ingredient (INN) with its Ukrainian, Latin and English
 * names, ATC code, pharmacological group (Ukrainian) and the brand names it is
 * commonly sold under on the Ukrainian market. The dictionary index flattens
 * every name (INN + latin + english + brands + explicit synonyms) into search
 * mappings, so this file is the single source of truth for query normalization.
 *
 * This is reference data for pharmacists — always verify against the official
 * instruction. Nothing here constitutes a prescription or treatment advice.
 */
import type { Provenance } from "../provenance";

export interface IngredientSeed {
  /** Canonical Ukrainian INN, used for display and catalog matching. */
  inn: string;
  /** Latin INN (as printed on packaging / prescriptions). */
  latin: string;
  /** English INN. */
  english: string;
  /** ATC code (WHO). */
  atc: string;
  /** Pharmacological group (Ukrainian). */
  group: string;
  /** Brand / trade names (mixed Ukrainian and Latin script). */
  brands: string[];
  /** Extra synonyms not covered above (e.g. US generic name). */
  synonyms?: string[];
  /** Per-name source override for official registry/list names. */
  nameProvenance?: Record<string, Provenance>;
}

export const ingredientSeeds: IngredientSeed[] = [
  // ── Analgesics / antipyretics / NSAIDs ──────────────────────────────────
  { inn: "Парацетамол", latin: "Paracetamolum", english: "Paracetamol", atc: "N02BE01", group: "Анальгетики-антипіретики", brands: ["Панадол", "Panadol", "Ефералган", "Efferalgan", "Рапідол", "Цефекон"], synonyms: ["acetaminophen", "ацетамінофен"] },
  {
    inn: "Ібупрофен",
    latin: "Ibuprofenum",
    english: "Ibuprofen",
    atc: "M01AE01",
    group: "Нестероїдні протизапальні засоби (НПЗЗ)",
    brands: ["НУРОФЄН", "Nurofen", "Ібупром", "Ібуфен", " Imet", "Імет"],
    nameProvenance: {
      "НУРОФЄН": {
        sourceKey: "ua-state-expert-centre",
        evidenceLevel: "established",
        lastReviewed: "2019-10-22",
      },
    },
  },
  { inn: "Ацетилсаліцилова кислота", latin: "Acidum acetylsalicylicum", english: "Acetylsalicylic acid", atc: "N02BA01", group: "НПЗЗ / антиагреганти", brands: ["Аспірин", "Aspirin", "Аспірин Кардіо", "Кардіомагніл", "Магнікор"], synonyms: ["aspirin", "аспірин"] },
  { inn: "Диклофенак", latin: "Diclofenacum", english: "Diclofenac", atc: "M01AB05", group: "НПЗЗ", brands: ["Вольтарен", "Voltaren", "Диклоберл", "Диклак", "Олфен", "Наклофен"] },
  { inn: "Німесулід", latin: "Nimesulidum", english: "Nimesulide", atc: "M01AX17", group: "НПЗЗ", brands: ["Німесил", "Nimesil", "Німід", "Найз", "Месулід"] },
  { inn: "Кеторолак", latin: "Ketorolacum", english: "Ketorolac", atc: "M01AB15", group: "НПЗЗ", brands: ["Кеторол", "Кетанов", "Ketanov", "Кеталгін"] },
  { inn: "Кетопрофен", latin: "Ketoprofenum", english: "Ketoprofen", atc: "M01AE03", group: "НПЗЗ", brands: ["Фастум гель", "Кетонал", "Ketonal", "Фламакс"] },
  { inn: "Мелоксикам", latin: "Meloxicamum", english: "Meloxicam", atc: "M01AC06", group: "НПЗЗ", brands: ["Моваліс", "Movalis", "Мелбек", "Ревмоксикам"] },
  { inn: "Напроксен", latin: "Naproxenum", english: "Naproxen", atc: "M01AE02", group: "НПЗЗ", brands: ["Налгезин", "Naproxen"] },
  { inn: "Декскетопрофен", latin: "Dexketoprofenum", english: "Dexketoprofen", atc: "M01AE17", group: "НПЗЗ", brands: ["Дексалгін", "Dexalgin"] },
  { inn: "Ацеклофенак", latin: "Aceclofenacum", english: "Aceclofenac", atc: "M01AB16", group: "НПЗЗ", brands: ["Аертал", "Aertal", "Зеродол"] },
  { inn: "Індометацин", latin: "Indometacinum", english: "Indometacin", atc: "M01AB01", group: "НПЗЗ", brands: ["Метиндол"] },
  { inn: "Целекоксиб", latin: "Celecoxibum", english: "Celecoxib", atc: "M01AH01", group: "НПЗЗ (коксиби)", brands: ["Целебрекс", "Celebrex", "Ревмоксиб"] },
  { inn: "Метамізол натрію", latin: "Metamizolum natricum", english: "Metamizole", atc: "N02BB02", group: "Анальгетики", brands: ["Анальгін", "Analgin", "Баралгін"], synonyms: ["dipyrone"] },

  // ── Opioid / combined analgesics ────────────────────────────────────────
  { inn: "Трамадол", latin: "Tramadolum", english: "Tramadol", atc: "N02AX02", group: "Опіоїдні анальгетики", brands: ["Трамал", "Tramal"] },
  { inn: "Кодеїн", latin: "Codeinum", english: "Codeine", atc: "R05DA04", group: "Опіоїдні протикашльові", brands: ["Кодтерпін", "Солпадеїн"] },

  // ── Antibiotics ─────────────────────────────────────────────────────────
  { inn: "Амоксицилін", latin: "Amoxicillinum", english: "Amoxicillin", atc: "J01CA04", group: "Пеніциліни", brands: ["Амоксил", "Оспамокс", "Флемоксин Солютаб", "Hiconcil"], synonyms: ["amoksytsylin"] },
  { inn: "Амоксицилін + клавуланова кислота", latin: "Amoxicillinum + Acidum clavulanicum", english: "Amoxicillin + clavulanic acid", atc: "J01CR02", group: "Захищені пеніциліни", brands: ["Аугментин", "Augmentin", "Амоксиклав", "Amoksiklav", "Флемоклав"], synonyms: ["amoksyklav"] },
  { inn: "Азитроміцин", latin: "Azithromycinum", english: "Azithromycin", atc: "J01FA10", group: "Макроліди", brands: ["Сумамед", "Sumamed", "Азитро", "Азимед", "Зитромакс"] },
  { inn: "Кларитроміцин", latin: "Clarithromycinum", english: "Clarithromycin", atc: "J01FA09", group: "Макроліди", brands: ["Клацид", "Klacid", "Фромілід"] },
  { inn: "Цефтріаксон", latin: "Ceftriaxonum", english: "Ceftriaxone", atc: "J01DD04", group: "Цефалоспорини III", brands: ["Роцефін", "Медаксон", "Лораксон"], synonyms: ["tseftriakson"] },
  { inn: "Цефуроксим", latin: "Cefuroximum", english: "Cefuroxime", atc: "J01DC02", group: "Цефалоспорини II", brands: ["Зіннат", "Zinnat", "Аксеф"] },
  { inn: "Цефіксим", latin: "Cefiximum", english: "Cefixime", atc: "J01DD08", group: "Цефалоспорини III", brands: ["Супракс", "Цефікс"] },
  { inn: "Ципрофлоксацин", latin: "Ciprofloxacinum", english: "Ciprofloxacin", atc: "J01MA02", group: "Фторхінолони", brands: ["Ципролет", "Ципринол", "Цифран"] },
  { inn: "Левофлоксацин", latin: "Levofloxacinum", english: "Levofloxacin", atc: "J01MA12", group: "Фторхінолони", brands: ["Таванік", "Левофлокс", "Локсоф"] },
  { inn: "Метронідазол", latin: "Metronidazolum", english: "Metronidazole", atc: "J01XD01", group: "Нітроімідазоли", brands: ["Трихопол", "Метрогіл", "Флагіл"] },
  { inn: "Доксициклін", latin: "Doxycyclinum", english: "Doxycycline", atc: "J01AA02", group: "Тетрацикліни", brands: ["Юнідокс Солютаб", "Доксибене"] },
  { inn: "Кларитроміцин", latin: "Clarithromycinum", english: "Clarithromycin", atc: "J01FA09", group: "Макроліди", brands: ["Клабакс"] },
  { inn: "Фосфоміцин", latin: "Fosfomycinum", english: "Fosfomycin", atc: "J01XX01", group: "Уроантисептики", brands: ["Монурал", "Monural"] },
  { inn: "Ніфуроксазид", latin: "Nifuroxazidum", english: "Nifuroxazide", atc: "A07AX03", group: "Кишкові антисептики", brands: ["Ентерофурил", "Ніфуроксазид"] },

  // ── Antifungals / antivirals ────────────────────────────────────────────
  { inn: "Флуконазол", latin: "Fluconazolum", english: "Fluconazole", atc: "J02AC01", group: "Протигрибкові", brands: ["Дифлюкан", "Diflucan", "Флюкостат", "Фуцис"] },
  { inn: "Ацикловір", latin: "Aciclovirum", english: "Aciclovir", atc: "J05AB01", group: "Противірусні", brands: ["Зовіракс", "Zovirax", "Герпевір"] },
  { inn: "Осельтамівір", latin: "Oseltamivirum", english: "Oseltamivir", atc: "J05AH02", group: "Противірусні (грип)", brands: ["Таміфлю", "Tamiflu"] },

  // ── Gastro ──────────────────────────────────────────────────────────────
  { inn: "Омепразол", latin: "Omeprazolum", english: "Omeprazole", atc: "A02BC01", group: "Інгібітори протонної помпи", brands: ["Омез", "Omez", "Гастрозол", "Лосек"], synonyms: ["omeprazol"] },
  { inn: "Пантопразол", latin: "Pantoprazolum", english: "Pantoprazole", atc: "A02BC02", group: "Інгібітори протонної помпи", brands: ["Контролок", "Нольпаза", "Пантасан"], synonyms: ["pantoprazol"] },
  { inn: "Езомепразол", latin: "Esomeprazolum", english: "Esomeprazole", atc: "A02BC05", group: "Інгібітори протонної помпи", brands: ["Нексіум", "Nexium", "Езолонг"] },
  { inn: "Рабепразол", latin: "Rabeprazolum", english: "Rabeprazole", atc: "A02BC04", group: "Інгібітори протонної помпи", brands: ["Парієт", "Разо"] },
  { inn: "Фамотидин", latin: "Famotidinum", english: "Famotidine", atc: "A02BA03", group: "Блокатори H2-гістамінових рецепторів", brands: ["Квамател"] },
  { inn: "Домперидон", latin: "Domperidonum", english: "Domperidone", atc: "A03FA03", group: "Прокінетики", brands: ["Мотиліум", "Motilium", "Домрид"] },
  { inn: "Метоклопрамід", latin: "Metoclopramidum", english: "Metoclopramide", atc: "A03FA01", group: "Прокінетики / протиблювотні", brands: ["Церукал", "Cerucal"] },
  { inn: "Дротаверин", latin: "Drotaverinum", english: "Drotaverine", atc: "A03AD02", group: "Спазмолітики", brands: ["Но-шпа", "No-Spa", "Дротаверин"], synonyms: ["drotaveryn"] },
  { inn: "Ондансетрон", latin: "Ondansetronum", english: "Ondansetron", atc: "A04AA01", group: "Протиблювотні засоби", brands: ["Ондансетрон"], synonyms: ["ondansetron"] },
  { inn: "Симетикон", latin: "Simeticonum", english: "Simethicone", atc: "A03AX13", group: "Вітрогінні", brands: ["Еспумізан", "Espumisan"] },
  { inn: "Лоперамід", latin: "Loperamidum", english: "Loperamide", atc: "A07DA03", group: "Протидіарейні", brands: ["Імодіум", "Imodium", "Лопедіум"] },
  { inn: "Омепразол", latin: "Omeprazolum", english: "Omeprazole", atc: "A02BC01", group: "Інгібітори протонної помпи", brands: ["Улсепан"] },
  { inn: "Урсодезоксихолева кислота", latin: "Acidum ursodeoxycholicum", english: "Ursodeoxycholic acid", atc: "A05AA02", group: "Гепатопротектори", brands: ["Урсофальк", "Урсохол"] },
  { inn: "Панкреатин", latin: "Pancreatinum", english: "Pancreatin", atc: "A09AA02", group: "Ферментні препарати", brands: ["Креон", "Creon", "Мезим", "Панзинорм"] },
  { inn: "Лактулоза", latin: "Lactulosum", english: "Lactulose", atc: "A06AD11", group: "Проносні", brands: ["Дуфалак", "Duphalac", "Нормазе"] },
  { inn: "Бісакодил", latin: "Bisacodylum", english: "Bisacodyl", atc: "A06AB02", group: "Проносні", brands: ["Дульколакс", "Бісакодил"] },

  // ── Antihistamines / allergy ────────────────────────────────────────────
  { inn: "Лоратадин", latin: "Loratadinum", english: "Loratadine", atc: "R06AX13", group: "Антигістамінні II покоління", brands: ["Кларитин", "Claritin", "Лорано"], synonyms: ["loratadyn"] },
  { inn: "Цетиризин", latin: "Cetirizinum", english: "Cetirizine", atc: "R06AE07", group: "Антигістамінні II покоління", brands: ["Цетрин", "Zyrtec", "Зіртек", "Аллертек"], synonyms: ["tsetyryzyn"] },
  { inn: "Левоцетиризин", latin: "Levocetirizinum", english: "Levocetirizine", atc: "R06AE09", group: "Антигістамінні", brands: ["Л-Цет", "Ксизал", "Алерон"] },
  { inn: "Дезлоратадин", latin: "Desloratadinum", english: "Desloratadine", atc: "R06AX27", group: "Антигістамінні", brands: ["Еріус", "Aerius", "Едем"] },
  { inn: "Фексофенадин", latin: "Fexofenadinum", english: "Fexofenadine", atc: "R06AX26", group: "Антигістамінні", brands: ["Телфаст", "Алтива"] },
  { inn: "Хлоропірамін", latin: "Chloropyraminum", english: "Chloropyramine", atc: "R06AC03", group: "Антигістамінні I покоління", brands: ["Супрастин", "Suprastin"] },
  { inn: "Диметинден", latin: "Dimetindenum", english: "Dimetindene", atc: "R06AB03", group: "Антигістамінні", brands: ["Фенистіл", "Fenistil"] },

  // ── Cardiovascular ──────────────────────────────────────────────────────
  { inn: "Еналаприл", latin: "Enalaprilum", english: "Enalapril", atc: "C09AA02", group: "Інгібітори АПФ", brands: ["Енап", "Enap", "Берліприл", "Ренітек"] },
  { inn: "Лізиноприл", latin: "Lisinoprilum", english: "Lisinopril", atc: "C09AA03", group: "Інгібітори АПФ", brands: ["Диротон", "Лоприл"] },
  { inn: "Раміприл", latin: "Ramiprilum", english: "Ramipril", atc: "C09AA05", group: "Інгібітори АПФ", brands: ["Хартіл", "Тритаце"] },
  { inn: "Періндоприл", latin: "Perindoprilum", english: "Perindopril", atc: "C09AA04", group: "Інгібітори АПФ", brands: ["Престаріум", "Prestarium"] },
  { inn: "Лозартан", latin: "Losartanum", english: "Losartan", atc: "C09CA01", group: "Блокатори рецепторів ангіотензину", brands: ["Лозап", "Lozap", "Лориста"] },
  { inn: "Валсартан", latin: "Valsartanum", english: "Valsartan", atc: "C09CA03", group: "Блокатори рецепторів ангіотензину", brands: ["Діован", "Вальсакор"] },
  { inn: "Кандесартан", latin: "Candesartanum", english: "Candesartan", atc: "C09CA06", group: "Блокатори рецепторів ангіотензину", brands: ["Кандесар", "Атаканд"] },
  { inn: "Амлодипін", latin: "Amlodipinum", english: "Amlodipine", atc: "C08CA01", group: "Блокатори кальцієвих каналів", brands: ["Норваск", "Амлодак", "Аген"], synonyms: ["amlodypin"] },
  { inn: "Ніфедипін", latin: "Nifedipinum", english: "Nifedipine", atc: "C08CA05", group: "Блокатори кальцієвих каналів", brands: ["Коринфар", "Фармадипін"] },
  { inn: "Бісопролол", latin: "Bisoprololum", english: "Bisoprolol", atc: "C07AB07", group: "Бета-блокатори", brands: ["Конкор", "Concor", "Бісопрол"] },
  { inn: "Метопролол", latin: "Metoprololum", english: "Metoprolol", atc: "C07AB02", group: "Бета-блокатори", brands: ["Егілок", "Беталок", "Метокард"] },
  { inn: "Небіволол", latin: "Nebivololum", english: "Nebivolol", atc: "C07AB12", group: "Бета-блокатори", brands: ["Небілет", "Небілонг"] },
  { inn: "Карведилол", latin: "Carvedilolum", english: "Carvedilol", atc: "C07AG02", group: "Бета-блокатори", brands: ["Коріол", "Кардіостад"] },
  { inn: "Гідрохлортіазид", latin: "Hydrochlorothiazidum", english: "Hydrochlorothiazide", atc: "C03AA03", group: "Тіазидні діуретики", brands: ["Гіпотіазид"] },
  { inn: "Індапамід", latin: "Indapamidum", english: "Indapamide", atc: "C03BA11", group: "Тіазидоподібні діуретики", brands: ["Аріфон", "Індап"] },
  { inn: "Фуросемід", latin: "Furosemidum", english: "Furosemide", atc: "C03CA01", group: "Петльові діуретики", brands: ["Лазикс", "Lasix"], synonyms: ["furosemid"] },
  { inn: "Торасемід", latin: "Torasemidum", english: "Torasemide", atc: "C03CA04", group: "Петльові діуретики", brands: ["Торсид", "Тригрим"], synonyms: ["torasemid"] },
  { inn: "Спіронолактон", latin: "Spironolactonum", english: "Spironolactone", atc: "C03DA01", group: "Калійзберігаючі діуретики", brands: ["Верошпірон", "Veroshpiron"] },
  { inn: "Аторвастатин", latin: "Atorvastatinum", english: "Atorvastatin", atc: "C10AA05", group: "Статини", brands: ["Ліпримар", "Аторис", "Торвакард"] },
  { inn: "Розувастатин", latin: "Rosuvastatinum", english: "Rosuvastatin", atc: "C10AA07", group: "Статини", brands: ["Крестор", "Розарт", "Роксера"] },
  { inn: "Симвастатин", latin: "Simvastatinum", english: "Simvastatin", atc: "C10AA01", group: "Статини", brands: ["Вазиліп", "Симвакард"] },
  { inn: "Дигоксин", latin: "Digoxinum", english: "Digoxin", atc: "C01AA05", group: "Серцеві глікозиди", brands: ["Дигоксин"] },
  { inn: "Нітрогліцерин", latin: "Nitroglycerinum", english: "Nitroglycerin", atc: "C01DA02", group: "Нітрати", brands: ["Нітрогліцерин", "Нітромінт"] },
  { inn: "Ізосорбіду динітрат", latin: "Isosorbidi dinitras", english: "Isosorbide dinitrate", atc: "C01DA08", group: "Нітрати", brands: ["Ізокет", "Кардикет"] },
  { inn: "Аміодарон", latin: "Amiodaronum", english: "Amiodarone", atc: "C01BD01", group: "Антиаритмічні", brands: ["Кордарон", "Cordarone"] },

  // ── Anticoagulants / antiplatelets ──────────────────────────────────────
  { inn: "Варфарин", latin: "Warfarinum", english: "Warfarin", atc: "B01AA03", group: "Антикоагулянти (антагоністи вітаміну K)", brands: ["Варфарин", "Warfarin", "Мареван"] },
  { inn: "Ривароксабан", latin: "Rivaroxabanum", english: "Rivaroxaban", atc: "B01AF01", group: "Прямі оральні антикоагулянти", brands: ["Ксарелто", "Xarelto"], synonyms: ["ksarelto"] },
  {
    inn: "Апіксабан",
    latin: "Apixabanum",
    english: "Apixaban",
    atc: "B01AF02",
    group: "Прямі оральні антикоагулянти",
    brands: ["Еліквіс", "Eliquis"],
    synonyms: ["elikvis"],
    nameProvenance: {
      "Еліквіс": {
        sourceKey: "ukraine_state_drug_registry",
        evidenceLevel: "reference",
      },
    },
  },
  { inn: "Дабігатран", latin: "Dabigatranum", english: "Dabigatran", atc: "B01AE07", group: "Прямі оральні антикоагулянти", brands: ["Прадакса", "Pradaxa"] },
  { inn: "Еноксапарин", latin: "Enoxaparinum", english: "Enoxaparin", atc: "B01AB05", group: "Низькомолекулярні гепарини", brands: ["Клексан", "Clexane", "Фленокс"] },
  { inn: "Клопідогрель", latin: "Clopidogrelum", english: "Clopidogrel", atc: "B01AC04", group: "Антиагреганти", brands: ["Плавікс", "Plavix", "Клопідогрель"] },

  // ── Diabetes / endocrine ────────────────────────────────────────────────
  { inn: "Метформін", latin: "Metforminum", english: "Metformin", atc: "A10BA02", group: "Бігуаніди", brands: ["Сіофор", "Siofor", "Глюкофаж", "Метфогама"], synonyms: ["metformyn"] },
  { inn: "Гліклазид", latin: "Gliclazidum", english: "Gliclazide", atc: "A10BB09", group: "Похідні сульфонілсечовини", brands: ["Діабетон", "Diabeton", "Глідіаб"] },
  { inn: "Глімепірид", latin: "Glimepiridum", english: "Glimepiride", atc: "A10BB12", group: "Похідні сульфонілсечовини", brands: ["Амарил", "Amaryl", "Глемаз"] },
  {
    inn: "Дапагліфлозин",
    latin: "Dapagliflozin",
    english: "Dapagliflozin",
    atc: "A10BK01",
    group: "Інгібітори SGLT2",
    brands: ["ФОРКСІГА"],
    nameProvenance: {
      "Дапагліфлозин": {
        sourceKey: "ua-national-list-2025-10-10",
        evidenceLevel: "reference",
      },
      Dapagliflozin: {
        sourceKey: "ukraine_state_drug_registry",
        evidenceLevel: "reference",
      },
      "ФОРКСІГА": {
        sourceKey: "ukraine_state_drug_registry",
        evidenceLevel: "reference",
      },
    },
  },
  { inn: "Емпагліфлозин", latin: "Empagliflozinum", english: "Empagliflozin", atc: "A10BK03", group: "Інгібітори SGLT2", brands: ["Джардінс", "Jardiance"] },
  { inn: "Левотироксин натрію", latin: "Levothyroxinum natricum", english: "Levothyroxine", atc: "H03AA01", group: "Гормони щитоподібної залози", brands: ["Еутирокс", "Euthyrox", "L-Тироксин"] },

  // ── Respiratory ─────────────────────────────────────────────────────────
  { inn: "Сальбутамол", latin: "Salbutamolum", english: "Salbutamol", atc: "R03AC02", group: "Бета2-агоністи", brands: ["Вентолін", "Ventolin", "Сальбутамол"], synonyms: ["albuterol"] },
  { inn: "Будесонід", latin: "Budesonidum", english: "Budesonide", atc: "R03BA02", group: "Інгаляційні кортикостероїди", brands: ["Пульмікорт", "Будесонід"] },
  { inn: "Амброксол", latin: "Ambroxolum", english: "Ambroxol", atc: "R05CB06", group: "Муколітики", brands: ["Лазолван", "Lazolvan", "Амбробене", "Флавамед"] },
  { inn: "Ацетилцистеїн", latin: "Acetylcysteinum", english: "Acetylcysteine", atc: "R05CB01", group: "Муколітики", brands: ["АЦЦ", "ACC", "Флуімуцил"] },
  { inn: "Карбоцистеїн", latin: "Carbocisteinum", english: "Carbocisteine", atc: "R05CB03", group: "Муколітики", brands: ["Флюдітек", "Муколік"] },
  { inn: "Бромгексин", latin: "Bromhexinum", english: "Bromhexine", atc: "R05CB02", group: "Муколітики", brands: ["Бромгексин", "Солвін"] },
  { inn: "Ксилометазолін", latin: "Xylometazolinum", english: "Xylometazoline", atc: "R01AA07", group: "Деконгестанти", brands: ["Отривін", "Ринонорм", "Галазолін"] },
  { inn: "Оксиметазолін", latin: "Oxymetazolinum", english: "Oxymetazoline", atc: "R01AA05", group: "Деконгестанти", brands: ["Назівін", "Нокспрей"] },
  { inn: "Фенспірид", latin: "Fenspiridum", english: "Fenspiride", atc: "R03DX03", group: "Протизапальні (дихальні шляхи)", brands: ["Еріспірус", "Інспірон"] },
  { inn: "Монтелукаст", latin: "Montelukastum", english: "Montelukast", atc: "R03DC03", group: "Антагоністи лейкотрієнових рецепторів", brands: ["Сингуляр", "Монтел"] },

  // ── CNS / neuro / psych ─────────────────────────────────────────────────
  { inn: "Сертралін", latin: "Sertralinum", english: "Sertraline", atc: "N06AB06", group: "Антидепресанти (СІЗЗС)", brands: ["Золофт", "Zoloft", "Серлифт"] },
  { inn: "Есциталопрам", latin: "Escitalopramum", english: "Escitalopram", atc: "N06AB10", group: "Антидепресанти (СІЗЗС)", brands: ["Ципралекс", "Есцитам"] },
  { inn: "Флуоксетин", latin: "Fluoxetinum", english: "Fluoxetine", atc: "N06AB03", group: "Антидепресанти (СІЗЗС)", brands: ["Прозак", "Prozac"] },
  { inn: "Амітриптилін", latin: "Amitriptylinum", english: "Amitriptyline", atc: "N06AA09", group: "Трициклічні антидепресанти", brands: ["Амітриптилін"] },
  { inn: "Діазепам", latin: "Diazepamum", english: "Diazepam", atc: "N05BA01", group: "Бензодіазепіни", brands: ["Сибазон", "Реланіум"] },
  { inn: "Гідазепам", latin: "Gidazepamum", english: "Gidazepam", atc: "N05BA", group: "Анксіолітики", brands: ["Гідазепам"] },
  { inn: "Габапентин", latin: "Gabapentinum", english: "Gabapentin", atc: "N03AX12", group: "Протиепілептичні", brands: ["Габагама", "Нейралгін"] },
  { inn: "Прегабалін", latin: "Pregabalinum", english: "Pregabalin", atc: "N03AX16", group: "Протиепілептичні", brands: ["Лірика", "Lyrica"] },
  { inn: "Карбамазепін", latin: "Carbamazepinum", english: "Carbamazepine", atc: "N03AF01", group: "Протиепілептичні", brands: ["Фінлепсин", "Тегретол"] },
  { inn: "Вальпроєва кислота", latin: "Acidum valproicum", english: "Valproic acid", atc: "N03AG01", group: "Протиепілептичні", brands: ["Депакін", "Конвулекс"] },
  { inn: "Бетагістин", latin: "Betahistinum", english: "Betahistine", atc: "N07CA01", group: "Протизапаморочливі", brands: ["Бетасерк", "Вестибо"] },

  // ── Vitamins / minerals / supplements ───────────────────────────────────
  { inn: "Аскорбінова кислота", latin: "Acidum ascorbicum", english: "Ascorbic acid", atc: "A11GA01", group: "Вітаміни", brands: ["Вітамін C", "Аскорутин"], synonyms: ["vitamin c", "вітамін ц"] },
  { inn: "Колекальциферол", latin: "Colecalciferolum", english: "Colecalciferol", atc: "A11CC05", group: "Вітамін D", brands: ["Аквадетрим", "Вігантол", "Детрімакс"], synonyms: ["vitamin d3", "вітамін д3"] },
  { inn: "Ціанокобаламін", latin: "Cyanocobalaminum", english: "Cyanocobalamin", atc: "B03BA01", group: "Вітамін B12", brands: ["Вітамін B12"] },
  { inn: "Фолієва кислота", latin: "Acidum folicum", english: "Folic acid", atc: "B03BB01", group: "Вітамін B9", brands: ["Фолієва кислота", "Фолацин"] },
  { inn: "Магнію лактат + піридоксин", latin: "Magnesii lactas + Pyridoxinum", english: "Magnesium + pyridoxine", atc: "A12CC", group: "Препарати магнію", brands: ["Магне B6", "Magne B6", "Магнікум"] },
  { inn: "Магнію сульфат", latin: "Magnesii sulfas", english: "Magnesium sulfate", atc: "B05XA05", group: "Електроліти", brands: ["Магнію сульфат"], synonyms: ["mahniiu sulfat"] },
  { inn: "Калію хлорид", latin: "Kalii chloridum", english: "Potassium chloride", atc: "B05XA01", group: "Електроліти", brands: ["Калію хлорид"], synonyms: ["kaliiu khloryd"] },
  { inn: "Заліза сульфат", latin: "Ferrosi sulfas", english: "Ferrous sulfate", atc: "B03AA07", group: "Препарати заліза", brands: ["Тардиферон", "Сорбіфер Дурулес"] },
  { inn: "Заліза (III) гідроксид полімальтозат", latin: "Ferri hydroxidum polymaltosum", english: "Iron polymaltose", atc: "B03AB05", group: "Препарати заліза", brands: ["Мальтофер", "Феррум Лек"] },
  { inn: "Калію та магнію аспарагінат", latin: "Kalii et magnesii asparaginas", english: "Potassium/magnesium aspartate", atc: "A12CC", group: "Електроліти", brands: ["Аспаркам", "Панангін"] },

  // ── Topical / other ─────────────────────────────────────────────────────
  { inn: "Гепарин натрію", latin: "Heparinum natricum", english: "Heparin (topical)", atc: "C05BA03", group: "Місцеві антикоагулянти", brands: ["Ліотон", "Гепаринова мазь"] },
  { inn: "Декспантенол", latin: "Dexpanthenolum", english: "Dexpanthenol", atc: "D03AX03", group: "Репаранти", brands: ["Бепантен", "Bepanthen", "Пантестин"] },
  { inn: "Хлоргексидин", latin: "Chlorhexidinum", english: "Chlorhexidine", atc: "D08AC02", group: "Антисептики", brands: ["Хлоргексидин", "Гексикон"] },
  { inn: "Повідон-йод", latin: "Povidonum iodinatum", english: "Povidone-iodine", atc: "D08AG02", group: "Антисептики", brands: ["Бетадин", "Betadine"] },
  { inn: "Німесулід", latin: "Nimesulidum", english: "Nimesulide", atc: "M01AX17", group: "НПЗЗ", brands: ["Апоніл"] },
  { inn: "Диклофенак", latin: "Diclofenacum", english: "Diclofenac", atc: "M02AA15", group: "НПЗЗ (місцево)", brands: ["Диклак гель", "Долобене"] },
  { inn: "Лідокаїн", latin: "Lidocainum", english: "Lidocaine", atc: "N01BB02", group: "Місцеві анестетики", brands: ["Лідокаїн"] },
  { inn: "Тизанідин", latin: "Tizanidinum", english: "Tizanidine", atc: "M03BX02", group: "Міорелаксанти", brands: ["Сирдалуд", "Тизалуд"] },
  { inn: "Толперизон", latin: "Tolperisonum", english: "Tolperisone", atc: "M03BX04", group: "Міорелаксанти", brands: ["Мідокалм", "Mydocalm"] },

  // ── Steroids / hormones ─────────────────────────────────────────────────
  { inn: "Преднізолон", latin: "Prednisolonum", english: "Prednisolone", atc: "H02AB06", group: "Глюкокортикоїди", brands: ["Преднізолон"], synonyms: ["prednizolon"] },
  { inn: "Дексаметазон", latin: "Dexamethasonum", english: "Dexamethasone", atc: "H02AB02", group: "Глюкокортикоїди", brands: ["Дексаметазон", "Дексазон"], synonyms: ["deksametazon"] },
  { inn: "Метилпреднізолон", latin: "Methylprednisolonum", english: "Methylprednisolone", atc: "H02AB04", group: "Глюкокортикоїди", brands: ["Метипред", "Медрол"] },

  // ── Urology / misc ──────────────────────────────────────────────────────
  { inn: "Тамсулозин", latin: "Tamsulosinum", english: "Tamsulosin", atc: "G04CA02", group: "Альфа-адреноблокатори", brands: ["Омнік", "Omnic", "Фокусин"] },
  { inn: "Силденафіл", latin: "Sildenafilum", english: "Sildenafil", atc: "G04BE03", group: "Інгібітори ФДЕ-5", brands: ["Віагра", "Viagra"] },
  { inn: "Дротаверин", latin: "Drotaverinum", english: "Drotaverine", atc: "A03AD02", group: "Спазмолітики", brands: ["Спазмол"] },
  { inn: "Атропін", latin: "Atropinum", english: "Atropine", atc: "A03BA01", group: "Антихолінергічні засоби", brands: ["Атропін"], synonyms: ["atropin"] },
  { inn: "Адреналін", latin: "Adrenalinum", english: "Epinephrine", atc: "C01CA24", group: "Адренергічні засоби", brands: ["Адреналін"], synonyms: ["adrenalin", "epinephrine"] },
];
