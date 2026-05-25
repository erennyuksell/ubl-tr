// shared/lib/ubl-tr/constants.ts
// GİB UBL-TR constants — tax codes, unit codes, etc.

/** Default GİB birim kodu: NIU (adet) */
export const DEFAULT_UNIT_CODE = 'NIU';

/** Default GİB vergi kodu: 0015 = Gerçek Usulde KDV */
export const DEFAULT_TAX_TYPE_CODE = '0015';
export const DEFAULT_TAX_TYPE_NAME = 'KDV';

/** Tevkifat vergi kodu */
export const WITHHOLDING_TAX_TYPE_CODE = '9015';

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
