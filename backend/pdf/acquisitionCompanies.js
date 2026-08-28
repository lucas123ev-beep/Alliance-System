// Bank / company data for the two Alliance Global trading entities used to
// issue Proformas, Commercial Invoices and Packing Lists.
// Keyed by the `acquisition_company` value stored on orders ("HK" / "NINGBO").
module.exports = {
  HK: {
    code: "HK",
    name: "HONG KONG ALLIANCE GLOBAL TRADING CO., LTD",
    addressLine: "Unit 6, 10/Floor, Siu On Plaza. | 482 Jaffe Road, Causeway Bay. | Hong Kong",
    tel: "+55 51 98136-3131",
    email: "martiello@hkag.co",
    website: "www.hkag.co",
    countryOfAcquisition: "Hong Kong",
    bank: {
      beneficiary: "Hong Kong Alliance Global Trading Company Limited",
      address: "Unit 6, 10/Floor, Siu On Plaza. 482 Jaffe Road, Causeway Bay. Hong Kong.",
      account: "023184997-838",
      bankName: "HSBC - The Hongkong and Shanghai Banking Corporation",
      swift: "HSBCHKHHHKH",
    },
  },
  NINGBO: {
    code: "NINGBO",
    name: "NINGBO WORLD ALLIANCE TRADING. CO. LTD.",
    chineseName: "宁波伍德埃莱斯贸易有限公司",
    addressLine: "715, Changxing Road, 501, Jiangbei District | Ningbo - Zhejiang - China | Zip Code: 315000",
    tel: "+86 15888552349",
    countryOfAcquisition: "China",
    bank: {
      beneficiary: "Ningbo World Alliance Trading Company Limited",
      address: "715, Changxing Road, 501, Jiangbei District, Ningbo - Zhejiang - China, Zip: 315000",
      account: "3996000387571",
      bankName: "CITIBANK, N.A., HONG KONG",
      // Both the 8-char code and its 11-char form (8-char + "XXX" primary-
      // office suffix) are the same bank/branch — shown side by side since
      // different receiving banks expect one or the other on a wire.
      swift: "CITIHKHX / CITIHKHXXXX",
      beneficiaryAddress: "26/F., Tower One, Time Square, 1 Matheson Street, Causeway Bay HK",
    },
    // Domestic RMB account used specifically on Supplier Purchase Contracts
    // (see pdf/contract.js) — factories in China are paid via this Bank of
    // China account, not the CITIBANK HK account above (that one is for
    // international/client-facing wires on Proforma/Commercial Invoice).
    domesticBank: {
      taxId: "91330200MA2AGNFT2Q",
      bankName: "中国银行宁波市鄞州分行营业部",
      account: "357174002806",
      address: "浙江省宁波市江北区长兴路715号501室",
      tel: "15888552349",
    },
  },
};
