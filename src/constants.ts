// shared/lib/ubl-tr/constants.ts
// GİB UBL-TR constants — tax codes, unit codes, etc.

/** Default GİB birim kodu: NIU (adet) */
export const DEFAULT_UNIT_CODE = 'NIU';

/** Default GİB vergi kodu: 0015 = Gerçek Usulde KDV */
export const DEFAULT_TAX_TYPE_CODE = '0015';
export const DEFAULT_TAX_TYPE_NAME = 'KDV';

/**
 * @deprecated Not written any more. GİB's schematron rejects `9015` inside WithholdingTaxTotal: a
 * withholding line needs its own tevkifat code (`WITHHOLDING_TAX_CODES`). Kept for callers that
 * still import it; the builder refuses a withholding line without a code, `validate: false`
 * included.
 */
export const WITHHOLDING_TAX_TYPE_CODE = '9015';

/** One GİB KDV tevkifat code: its name and the percent of the VAT it withholds. */
export interface UblWithholdingTaxCode {
  /** GİB's name for the transaction. */
  name: string;
  /** Percent of the VAT withheld (90 = 9/10). GİB's schematron accepts no other rate for the code. */
  rate: number;
}

/**
 * GİB KDV tevkifat codes and their fixed rates: 601-627 partial, 801-825 full (10/10). GİB's
 * schematron checks the pair ("'606' vergi tipinin yüzdesi '50' olamaz"), so validation does too.
 * Every code was accepted with this rate, and 606, 801 and 825 rejected with another, by the
 * schematron of Uyumsoft's test environment (ValidateInvoice, 2026-09-23 and 2026-09-24).
 * 650 ("Diğerleri") is not listed: that schematron rejects it as an unknown TaxTypeCode.
 */
export const WITHHOLDING_TAX_CODES: Readonly<Record<string, UblWithholdingTaxCode>> = {
  '601': {
    rate: 40,
    name: 'Yapım işleri ile bu işlerle birlikte ifa edilen mühendislik-mimarlık ve etüt-proje hizmetleri',
  },
  '602': { rate: 90, name: 'Etüt, plan-proje, danışmanlık, denetim ve benzeri hizmetler' },
  '603': {
    rate: 70,
    name: 'Makine, teçhizat, demirbaş ve taşıtlara ait tadil, bakım ve onarım hizmetleri',
  },
  '604': { rate: 50, name: 'Yemek servis hizmeti' },
  '605': { rate: 50, name: 'Organizasyon hizmeti' },
  '606': { rate: 90, name: 'İşgücü temin hizmetleri' },
  '607': { rate: 90, name: 'Özel güvenlik hizmeti' },
  '608': { rate: 90, name: 'Yapı denetim hizmetleri' },
  '609': {
    rate: 70,
    name: 'Fason olarak yaptırılan tekstil ve konfeksiyon işleri, çanta ve ayakkabı dikim işleri ve bu işlere aracılık hizmetleri',
  },
  '610': { rate: 90, name: 'Turistik mağazalara verilen müşteri bulma / götürme hizmetleri' },
  '611': {
    rate: 90,
    name: 'Spor kulüplerinin yayın, reklam ve isim hakkı gelirlerine konu işlemleri',
  },
  '612': { rate: 90, name: 'Temizlik hizmeti' },
  '613': { rate: 90, name: 'Çevre ve bahçe bakım hizmetleri' },
  '614': { rate: 50, name: 'Servis taşımacılığı hizmeti' },
  '615': { rate: 70, name: 'Her türlü baskı ve basım hizmetleri' },
  '616': {
    rate: 50,
    name: '5018 sayılı Kanuna ekli cetvellerdeki idare, kurum ve kuruşlara yapılan diğer hizmetler',
  },
  '617': { rate: 70, name: 'Hurda metalden elde edilen külçe teslimleri' },
  '618': {
    rate: 70,
    name: 'Hurda metalden elde edilenler dışındaki bakır, çinko, demir çelik, alüminyum ve kurşun külçe teslimi',
  },
  '619': { rate: 70, name: 'Bakır, çinko ve alüminyum ürünlerinin teslimi' },
  '620': { rate: 70, name: 'İstisnadan vazgeçenlerin hurda ve atık teslimi' },
  '621': {
    rate: 90,
    name: 'Metal, plastik, lastik, kauçuk, kâğıt ve cam hurda ve atıklardan elde edilen hammadde teslimi',
  },
  '622': { rate: 90, name: 'Pamuk, tiftik, yün ve yapağı ile ham post ve deri teslimleri' },
  '623': { rate: 50, name: 'Ağaç ve orman ürünleri teslimi' },
  '624': { rate: 20, name: 'Yük taşımacılığı hizmeti' },
  '625': { rate: 30, name: 'Ticari reklam hizmetleri' },
  '626': { rate: 20, name: 'Diğer teslimler' },
  '627': { rate: 50, name: 'Demir-çelik ürünlerinin teslimi' },
  '801': {
    rate: 100,
    name: 'Yapım işleri ile bu işlerle birlikte ifa edilen mühendislik-mimarlık ve etüt-proje hizmetleri (tam tevkifat)',
  },
  '802': {
    rate: 100,
    name: 'Etüt, plan-proje, danışmanlık, denetim ve benzeri hizmetler (tam tevkifat)',
  },
  '803': {
    rate: 100,
    name: 'Makine, teçhizat, demirbaş ve taşıtlara ait tadil, bakım ve onarım hizmetleri (tam tevkifat)',
  },
  '804': { rate: 100, name: 'Yemek servis hizmeti (tam tevkifat)' },
  '805': { rate: 100, name: 'Organizasyon hizmeti (tam tevkifat)' },
  '806': { rate: 100, name: 'İşgücü temin hizmetleri (tam tevkifat)' },
  '807': { rate: 100, name: 'Özel güvenlik hizmeti (tam tevkifat)' },
  '808': { rate: 100, name: 'Yapı denetim hizmetleri (tam tevkifat)' },
  '809': {
    rate: 100,
    name: 'Fason olarak yaptırılan tekstil ve konfeksiyon işleri, çanta ve ayakkabı dikim işleri ve bu işlere aracılık hizmetleri (tam tevkifat)',
  },
  '810': {
    rate: 100,
    name: 'Turistik mağazalara verilen müşteri bulma / götürme hizmetleri (tam tevkifat)',
  },
  '811': {
    rate: 100,
    name: 'Spor kulüplerinin yayın, reklam ve isim hakkı gelirlerine konu işlemleri (tam tevkifat)',
  },
  '812': { rate: 100, name: 'Temizlik hizmeti (tam tevkifat)' },
  '813': { rate: 100, name: 'Çevre ve bahçe bakım hizmetleri (tam tevkifat)' },
  '814': { rate: 100, name: 'Servis taşımacılığı hizmeti (tam tevkifat)' },
  '815': { rate: 100, name: 'Her türlü baskı ve basım hizmetleri (tam tevkifat)' },
  '816': { rate: 100, name: 'Hurda metalden elde edilen külçe teslimleri (tam tevkifat)' },
  '817': {
    rate: 100,
    name: 'Hurda metalden elde edilenler dışındaki bakır, çinko, demir çelik, alüminyum ve kurşun külçe teslimi (tam tevkifat)',
  },
  '818': {
    rate: 100,
    name: 'Bakır, çinko, alüminyum ve kurşun ürünlerinin teslimi (tam tevkifat)',
  },
  '819': { rate: 100, name: 'İstisnadan vazgeçenlerin hurda ve atık teslimi (tam tevkifat)' },
  '820': {
    rate: 100,
    name: 'Metal, plastik, lastik, kauçuk, kâğıt ve cam hurda ve atıklardan elde edilen hammadde teslimi (tam tevkifat)',
  },
  '821': {
    rate: 100,
    name: 'Pamuk, tiftik, yün ve yapağı ile ham post ve deri teslimleri (tam tevkifat)',
  },
  '822': { rate: 100, name: 'Ağaç ve orman ürünleri teslimi (tam tevkifat)' },
  '823': { rate: 100, name: 'Yük taşımacılığı hizmeti (tam tevkifat)' },
  '824': { rate: 100, name: 'Ticari reklam hizmetleri (tam tevkifat)' },
  '825': { rate: 100, name: 'Demir-çelik ürünlerinin teslimi (tam tevkifat)' },
};

/**
 * Invoice types that may carry a WithholdingTaxTotal, as GİB's schematron lists them
 * ("cac:WithholdingTaxTotal elemanı varken fatura tipi TEVKIFAT, YTBTEVKIFAT, IADE, YTBIADE, SGK,
 * SARJ ve SARJANLIK olabilir"). TEVKIFATIADE is not among them: checked against the schematron
 * on Uyumsoft's test environment, 2026-09-24. The reverse is not required: a TEVKIFAT invoice
 * without any withholding line passes the same schematron, so validation does not ask for one.
 */
export const WITHHOLDING_INVOICE_TYPE_CODES: readonly string[] = [
  'TEVKIFAT',
  'YTBTEVKIFAT',
  'IADE',
  'YTBIADE',
  'SGK',
  'SARJ',
  'SARJANLIK',
];

/**
 * Return invoice types. GİB requires a BillingReference to the returned invoice on each
 * (DocumentTypeCode IADE and its 16-character ID), so validation requires
 * `billingReferences` on them.
 */
export const RETURN_INVOICE_TYPE_CODES: readonly string[] = [
  'IADE',
  'TEVKIFATIADE',
  'YTBIADE',
  'YTBTEVKIFATIADE',
];

/**
 * Which invoice types a profile allows, and which profile a type needs, as GİB's e-Fatura schematron
 * (`UBL-TR_Common_Schematron.xml`, `InvoiceTypeCodeCheck` and the per-profile checks, package of
 * 2026-08-21) writes them. Profiles and types not named here are not restricted by it.
 */
export const PROFILE_INVOICE_TYPE_CODES: Readonly<Record<string, readonly string[]>> = {
  ENERJI: ['SARJ', 'SARJANLIK'],
  ILAC_TIBBICIHAZ: ['SATIS', 'ISTISNA', 'TEVKIFAT', 'TEVKIFATIADE', 'IADE', 'IHRACKAYITLI'],
  YATIRIMTESVIK: ['SATIS', 'ISTISNA', 'IADE', 'TEVKIFAT', 'TEVKIFATIADE'],
  IDIS: ['SATIS', 'ISTISNA', 'IADE', 'TEVKIFAT', 'TEVKIFATIADE', 'IHRACKAYITLI'],
};

/**
 * The profiles an invoice type may be issued under ("Fatura tipi IADE iken fatura profili sadece
 * TEMELFATURA, EARSIVFATURA, ILAC_TIBBICIHAZ, YATIRIMTESVIK, IDIS veya KAMU olabilir"). A return
 * of a TICARIFATURA invoice is therefore not an IADE under TICARIFATURA: the buyer refuses a
 * commercial invoice with an application response instead. SARJ and SARJANLIK need ENERJI on an
 * e-Fatura; the rule does not apply to e-Arşiv.
 */
export const INVOICE_TYPE_PROFILE_IDS: Readonly<Record<string, readonly string[]>> = {
  IADE: ['TEMELFATURA', 'EARSIVFATURA', 'ILAC_TIBBICIHAZ', 'YATIRIMTESVIK', 'IDIS', 'KAMU'],
  TEKNOLOJIDESTEK: ['EARSIVFATURA'],
  SARJ: ['ENERJI', 'EARSIVFATURA'],
  SARJANLIK: ['ENERJI', 'EARSIVFATURA'],
};

/**
 * The party type (`PARTYTYPE`) GİB requires on the buyer (`BuyerCustomerParty`) of these profiles:
 * EXPORT for an export, TAXFREE for a tax-free sale to a tourist. The builder writes it.
 */
export const BUYER_PARTY_TYPES: Readonly<Record<string, string>> = {
  IHRACAT: 'EXPORT',
  YOLCUBERABERFATURA: 'TAXFREE',
};

/** GİB Vergi Kodları → İsim eşleşmesi */
export const TAX_CODE_NAMES: Record<string, string> = {
  '0003': 'Gelir Vergisi Stopajı',
  '0015': 'KDV',
  '0061': 'KKDF Kesintisi',
  '0071': 'ÖTV 1. Liste',
  '0073': 'ÖTV 3. Liste',
  '0074': 'ÖTV 4. Liste',
  '0075': 'ÖTV 3A Liste',
  '0076': 'ÖTV 3B Liste',
  '0077': 'ÖTV 3C Liste',
  '1047': 'Damga Vergisi',
  '1048': '5035 SK Damga Vergisi',
  '4080': 'Özel İletişim Vergisi',
  '4081': '5035 SK Özel İletişim Vergisi',
  '8001': 'Borsa Tescil Ücreti',
  '8002': 'Enerji Fonu',
  '8004': 'TRT Payı',
  '8005': 'Elektrik Tüketim Vergisi',
  '8008': 'Çevre Temizlik Vergisi',
  '9015': 'KDV Tevkifatı',
  '9021': 'Banka Sigorta Muameleleri Vergisi',
  '9077': 'ÖTV 2. Liste',
};
