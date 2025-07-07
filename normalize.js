function normalizeCompany(raw, source) {
  let normalized = {
    "Phone Number": "",
    "Company Name": "",
    "Full Name": "",
    "Areas Covered In The UK": "",
    "Address": "",
    "Email Address": "",
    "Attachments": [],
    "Working Days": "",
    "Working Times": "",
    "Bank Registration...": "",
    "Betters/File Num...": "",
    "Services Offered": "",
    "S.K.L.S. (2025) date": "",
    "S.K.I.L.L.S (2024)": "",
    "Signature": "",
    "Insurances & Licences": "",
    "Jobs Assigned": "",
    "Last Modified": new Date().toISOString(),
    "Broadcast Messages": "",
    "Jobs": "",
    "Jobs 2": "",
    "Jobs 3": "",
    "Jobs 4": "",
    "SMS Responses": ""
  };

  switch (source.toLowerCase()) {
    case "google": {
      normalized["Company Name"] = raw.name || "";
      normalized["Phone Number"] = raw.formatted_phone_number || "";
      normalized["Address"] = raw.formatted_address || "";
      normalized["Services Offered"] = raw.types?.join(", ") || "";
      normalized["Email Address"] = ""; // Google Places doesn't give email
      normalized["Areas Covered In The UK"] = raw.plus_code?.compound_code?.split(" ")[0] || "";
      break;
    }

    case "refcom": {
      const addressParts = [
        raw.addressLine1,
        raw.addressLine2,
        raw.addressLine3,
        raw.town,
        raw.county,
        raw.postcode
      ].filter(Boolean);

      normalized["Company Name"] = raw.companyName || "";
      normalized["Phone Number"] = raw.telephoneNo || "";
      normalized["Email Address"] = raw.email || "";
      normalized["Address"] = addressParts.join(", ");
      normalized["Areas Covered In The UK"] = raw.county || raw.town || "";
      normalized["Services Offered"] = raw.fGas ? "FGAS Registered" : "";
      normalized["Betters/File Num..."] = raw.fGasCode || "";

      break;
    }

      case "fgas": {
        normalized["Company Name"] = raw.Company || "";
        normalized["Phone Number"] = raw.Telephone || "";
        normalized["Address"] = [
          raw.Address_1,
          raw.Address_2,
          raw.Address_3,
          raw.Address_4,
          raw.City,
          raw.Zip_Code
        ].filter(Boolean).join(", ");

        normalized["Areas Covered In The UK"] = raw.City || "";
        normalized["Email Address"] = ""; // FGAS doesn’t expose email
        normalized["Betters/File Num..."] = raw.FGasCode || ""; // If you get it
        normalized["Services Offered"] = "FGAS Registered";
        break;
      }


    // TODO: Add more cases for "gas-safe", "refcom", etc.

    default: {
      console.warn(`Unknown source: ${source}`);
      break;
    }
  }

  return normalized;
}

module.exports = { normalizeCompany };
