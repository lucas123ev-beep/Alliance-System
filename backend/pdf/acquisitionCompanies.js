// Bank / company data for the two Alliance Global trading entities used to
// issue Proformas, Commercial Invoices and Packing Lists.
// Keyed by the `acquisition_company` value stored on orders ("HK" / "NINGBO").
module.exports = {
  HK: {
    code: "HK",
    name: "HONG KONG ALLIANCE GLOBAL TRADING CO., LTD",
    addressLine: "Unit 6, 10/Floor, Siu On Plaza. | 482 Jaffe Road, Causeway Bay. | Hong Kong",
    tel: "+ 856 2528 2801",
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
      swift: "CITIHKHX",
      beneficiaryAddress: "26/F., Tower One, Time Square, 1 Matheson Street, Causeway Bay HK",
    },
  },
};
