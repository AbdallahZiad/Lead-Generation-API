const axios = require("axios");
const { normalizeCompany } = require("../normalize");

module.exports = async (req, res, next) => {
  const { companyName = "", postcode = "", registrationNumber = "" } = req.body;

  if (!companyName && !postcode && !registrationNumber) {
    return res.status(400).json({ error: "Provide at least one of: companyName, postcode, registrationNumber" });
  }

  const seen = new Set();
  const allResults = [];

  const performQuery = async (url, queryObj) => {
    try {
      const queryString = Object.entries(queryObj)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value ?? "")}`)
        .join("&");

      const fullUrl = `${url}?${queryString}`;
      const res = await axios.get(fullUrl);

      const data = Array.isArray(res.data) ? res.data : [res.data];

      for (const entry of data) {
        if (entry && !seen.has(entry.companyId)) {
          seen.add(entry.companyId);
          allResults.push(normalizeCompany(entry, "refcom"));
        }
      }
    } catch (err) {
      console.warn(`❌ Failed query for ${url} with`, queryObj, "\nError:", err.message);
    }
  };

  const baseUrl = "https://api.refcom.org.uk/api/PublicCompany";

  if (companyName)
    await performQuery(`${baseUrl}/GetByName`, {
      companyName,
      certificateCode: "",
      scheme: "both"
    });

  if (registrationNumber)
    await performQuery(`${baseUrl}/GetByName`, {
      certificateCode: registrationNumber,
      companyName: "",
      scheme: "both"
    });

  if (postcode)
    await performQuery(`${baseUrl}/GetByPostcode`, {
      postcode,
      radius: 10, // internal logic only — not exposed to client
      scheme: "both"
    });

  res.json({ source: "refcom", normalized: allResults });
};
