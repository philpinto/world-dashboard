/* ===== flags.js — Country/flag lookup data and conversion functions ===== */
/* Constants: COUNTRY_CODES, MID_TO_COUNTRY, HEX_TO_COUNTRY              */
/* Functions: countryToFlag, mmsiToFlag, hexToCountryCode, hexToFlag,     */
/*            mmsiToCountry                                               */

// Country name → ISO 3166-1 alpha-2 code
const COUNTRY_CODES = {
    'united states':'US','usa':'US','united kingdom':'GB','uk':'GB','germany':'DE',
    'france':'FR','italy':'IT','spain':'ES','netherlands':'NL','belgium':'BE',
    'switzerland':'CH','austria':'AT','sweden':'SE','norway':'NO','denmark':'DK',
    'finland':'FI','poland':'PL','czech republic':'CZ','czechia':'CZ',
    'portugal':'PT','ireland':'IE','greece':'GR','turkey':'TR','romania':'RO',
    'hungary':'HU','ukraine':'UA','russia':'RU','russian federation':'RU',
    'china':'CN','japan':'JP','south korea':'KR','republic of korea':'KR',
    'north korea':'KP','india':'IN','pakistan':'PK','bangladesh':'BD',
    'thailand':'TH','vietnam':'VN','philippines':'PH','indonesia':'ID',
    'malaysia':'MY','singapore':'SG','taiwan':'TW','hong kong':'HK',
    'australia':'AU','new zealand':'NZ','canada':'CA','mexico':'MX',
    'brazil':'BR','argentina':'AR','colombia':'CO','chile':'CL','peru':'PE',
    'saudi arabia':'SA','united arab emirates':'AE','uae':'AE','israel':'IL',
    'egypt':'EG','south africa':'ZA','nigeria':'NG','kenya':'KE','morocco':'MA',
    'ethiopia':'ET','algeria':'DZ','tunisia':'TN','libya':'LY','iran':'IR',
    'iraq':'IQ','qatar':'QA','kuwait':'KW','bahrain':'BH','oman':'OM',
    'luxembourg':'LU','iceland':'IS','malta':'MT','croatia':'HR','serbia':'RS',
    'bulgaria':'BG','slovakia':'SK','slovenia':'SI','estonia':'EE','latvia':'LV',
    'lithuania':'LT','cyprus':'CY','georgia':'GE','armenia':'AM','azerbaijan':'AZ',
    'kazakhstan':'KZ','uzbekistan':'UZ','mongolia':'MN','nepal':'NP',
    'sri lanka':'LK','myanmar':'MM','cambodia':'KH','laos':'LA',
    'papua new guinea':'PG','fiji':'FJ','panama':'PA','bahamas':'BS',
    'bermuda':'BM','cayman islands':'KY','jamaica':'JM','trinidad and tobago':'TT',
    'cuba':'CU','dominican republic':'DO','costa rica':'CR','venezuela':'VE',
    'ecuador':'EC','uruguay':'UY','paraguay':'PY','bolivia':'BO',
    'liberia':'LR','marshall islands':'MH','antigua and barbuda':'AG',
    'barbados':'BB','lebanon':'LB','jordan':'JO','syria':'SY','yemen':'YE',
    'afghanistan':'AF','cambodia':'KH','brunei':'BN','macau':'MO',
};

// MMSI MID (first 3 digits) → ISO country code
const MID_TO_COUNTRY = {
    '201':'GR','202':'GR','203':'GR','204':'PT','205':'LU','206':'BE','207':'FR',
    '208':'FR','209':'FR','210':'PT','211':'DE','212':'CY','213':'GE','214':'MD',
    '215':'MT','216':'LU','218':'DE','219':'DK','220':'DK','224':'ES','225':'ES',
    '226':'FR','227':'FR','228':'FR','229':'MT','230':'FI','231':'FI','232':'GB',
    '233':'GB','234':'GB','235':'GB','236':'GI','237':'GR','238':'HR','239':'GR',
    '240':'GR','241':'GR','242':'MA','243':'HU','244':'NL','245':'NL','246':'NL',
    '247':'IT','248':'MT','249':'MT','250':'IE','251':'IS','252':'LI','253':'LU',
    '254':'MC','255':'PT','256':'MT','257':'NO','258':'NO','259':'NO','261':'PL',
    '262':'ME','263':'PT','264':'RO','265':'SE','266':'SE','267':'SK','268':'SM',
    '269':'CH','270':'CZ','271':'TR','272':'UA','273':'RU','274':'MK','275':'LV',
    '276':'EE','277':'LT','278':'SI','279':'RS',
    '301':'AG','303':'US','304':'AG','305':'AG','306':'CW','307':'AR','308':'BS',
    '309':'BS','310':'BM','311':'BS','312':'BZ','314':'BB','316':'BR','319':'KY',
    '321':'CL','323':'CO','325':'CR','327':'CU','329':'GP','330':'DO','331':'DO',
    '332':'GT','334':'HN','336':'HT','338':'US','339':'JM','341':'KN','343':'LC',
    '345':'MX','347':'MQ','348':'MS','350':'NI','351':'PA','352':'PA','353':'PA',
    '354':'PA','355':'PA','356':'PA','357':'PA','358':'PR','359':'SV','361':'PM',
    '362':'TT','364':'TC','366':'US','367':'US','368':'US','369':'US','370':'PA',
    '371':'PA','372':'PA','373':'PA','374':'PA','375':'VC','376':'VC','377':'VC',
    '378':'VG','379':'VI',
    '401':'AF','403':'SA','405':'BD','408':'BH','410':'BT','412':'CN','413':'CN',
    '414':'CN','416':'TW','417':'LK','419':'IN','422':'IR','423':'AZ','425':'IQ',
    '428':'IL','431':'JP','432':'JP','434':'TM','436':'KZ','437':'UZ','438':'JO',
    '440':'KR','441':'KR','443':'PS','445':'KP','447':'KW','450':'LB','451':'KG',
    '453':'MO','455':'MV','457':'MN','459':'NP','461':'OM','463':'PK','466':'QA',
    '468':'SY','470':'AE','471':'AE','472':'TJ','473':'YE','475':'MM','477':'HK',
    '478':'BA',
    '501':'AQ','503':'AU','506':'MM','508':'BN','510':'FM','511':'PW','512':'NZ',
    '514':'KH','515':'KH','516':'CX','518':'CK','520':'FJ','523':'CC','525':'ID',
    '529':'KI','531':'LA','533':'MY','536':'MP','538':'MH','540':'NC','542':'NU',
    '544':'NR','546':'FR','548':'PH','553':'PG','555':'PN','557':'SB','559':'AS',
    '561':'WS','563':'SG','564':'SG','565':'SG','566':'SG','567':'TH','570':'TO',
    '572':'TV','574':'VN','576':'VU','577':'VU','578':'WF',
    '601':'ZA','603':'AO','605':'DZ','607':'TF','608':'IO','609':'BI','610':'BJ',
    '611':'BW','612':'CF','613':'CG','615':'CD','616':'CM','617':'CV','618':'KM',
    '619':'CI','620':'DJ','621':'EG','622':'ET','624':'ER','625':'GA','626':'GH',
    '627':'GM','629':'GN','630':'GW','631':'GQ','632':'GN','633':'KE','634':'LR',
    '635':'LR','636':'LR','637':'LR','638':'SS','642':'LY','644':'MG','645':'MG',
    '647':'MZ','649':'MR','650':'MU','654':'MW','655':'ML','656':'MN','657':'NE',
    '659':'NG','660':'RW','661':'SN','662':'SC','663':'SL','664':'SO','665':'NA',
    '666':'SD','667':'SZ','668':'TD','669':'TG','670':'TN','671':'TZ','672':'UG',
    '674':'BF','675':'ZM','676':'ZW','677':'MZ',
};

// ICAO24 hex prefix → country code (for aircraft)
const HEX_TO_COUNTRY = {
    'a':'US','b':'US', // A00000-BFFFFF = US (simplified)
    '00':'ZZ','01':'ZZ',
    '0a':'RU','0b':'RU','0c':'RU','0d':'RU','0e':'RU','0f':'RU','10':'RU','11':'RU',
    '14':'DZ','15':'DZ',
    '18':'MZ','19':'MZ',
    '1c':'ZW','1d':'ZW',
    '20':'ZA','21':'ZA','22':'ZA','23':'ZA','24':'EG','25':'EG',
    '26':'LY','27':'LY','28':'MA','29':'MA',
    '2a':'TN','2b':'TN',
    '30':'IT','31':'IT','32':'IT','33':'IT',
    '34':'ES','35':'ES','36':'ES','37':'ES',
    '38':'FR','39':'FR','3a':'FR','3b':'FR',
    '3c':'DE','3d':'DE','3e':'DE','3f':'DE',
    '40':'GB','41':'GB','42':'GB','43':'GB',
    '44':'AT','45':'AT','46':'BE','47':'BE',
    '48':'BG','49':'BG','4a':'DK','4b':'TR',
    '4c':'FI','4d':'GR','4e':'HU','4f':'NO',
    '50':'NL','51':'PL','52':'PT','53':'RO',
    '54':'SE','55':'CH','56':'UA','57':'CZ',
    '58':'BA','59':'HR','5a':'SI','5b':'SK',
    '60':'RS',
    '68':'AR','69':'AR','6a':'BR','6b':'BR','6c':'BR','6d':'BR',
    '70':'CL','71':'CL','72':'CO','73':'MX','74':'VE',
    '78':'CN','79':'CN','7a':'CN','7b':'CN',
    '7c':'AU','7d':'AU','7e':'AU','7f':'AU',
    '80':'IN','81':'IN','82':'IN','83':'IN',
    '84':'JP','85':'JP','86':'JP','87':'JP',
    '88':'KR','89':'KR',
    '8a':'ID','8b':'ID',
    '8c':'MY','8d':'MY',
    '90':'PH','91':'PH',
    '98':'TW','99':'TW',
    '9c':'SG','9d':'SG',
    'a0':'US','a1':'US','a2':'US','a3':'US','a4':'US','a5':'US','a6':'US','a7':'US',
    'a8':'US','a9':'US','aa':'US','ab':'US','ac':'US','ad':'US','ae':'US','af':'US',
    'c0':'CA','c1':'CA','c2':'CA','c3':'CA',
    'c8':'NZ','c9':'NZ',
    'e0':'SA','e1':'SA',
    'e4':'TH','e5':'TH',
};

function countryToFlag(countryName) {
    if (!countryName) return '';
    const code = COUNTRY_CODES[countryName.toLowerCase().trim()];
    if (!code) return '';
    // Convert ISO code to regional indicator emoji
    return String.fromCodePoint(...[...code].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
}

function mmsiToFlag(mmsi) {
    if (!mmsi) return '';
    const mid = String(mmsi).substring(0, 3);
    const code = MID_TO_COUNTRY[mid];
    if (!code) return '';
    return String.fromCodePoint(...[...code].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
}

function hexToCountryCode(hex) {
    if (!hex) return '';
    hex = hex.toLowerCase();
    // Try 2-char prefix first
    const two = hex.substring(0, 2);
    if (HEX_TO_COUNTRY[two]) return HEX_TO_COUNTRY[two];
    // Try 1-char prefix (US covers a-b range)
    const one = hex.substring(0, 1);
    if (HEX_TO_COUNTRY[one]) return HEX_TO_COUNTRY[one];
    return '';
}

function hexToFlag(hex) {
    const code = hexToCountryCode(hex);
    if (!code || code === 'ZZ') return '';
    return String.fromCodePoint(...[...code].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
}

function mmsiToCountry(mmsi) {
    if (!mmsi) return '';
    const mid = String(mmsi).substring(0, 3);
    const code = MID_TO_COUNTRY[mid];
    if (!code) return code || '';
    // Reverse lookup country name from code
    for (const [name, c] of Object.entries(COUNTRY_CODES)) {
        if (c === code) return name.replace(/\b\w/g, l => l.toUpperCase());
    }
    return code;
}
