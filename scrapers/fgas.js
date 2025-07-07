const puppeteer = require("puppeteer");
const { normalizeCompany } = require("../normalize");

module.exports = async (req, res, next) => {
  const { companyName = "", city = "", numberOfRecords = 10 } = req.body;

  if (!companyName && !city) {
    return res.status(400).json({
      error: "At least one of companyName or city is required.",
    });
  }

  const results = [];
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.goto("https://fgasregister.com/company-directory/", {
      waitUntil: "networkidle2",
    });

    // Find iframe with inputs & pagination
    await page.waitForSelector('iframe[src*="sites.shocklogic.com/FGAS/directory"]');
    const iframeHandles = await page.$$('iframe');

    let inputFrame = null;
    let paginationFrame = null;

    for (const handle of iframeHandles) {
      const frame = await handle.contentFrame();
      if (!frame) continue;

      const hasInput = await frame.$('input[aria-label="Company Name"]');
      const hasPagination = await frame.$('button.q-btn i');

      if (hasInput) inputFrame = frame;
      if (hasPagination) paginationFrame = frame;
    }

    if (!inputFrame || !paginationFrame) {
      throw new Error("Could not locate input and pagination frames.");
    }

    // Intercept API responses
    const seenCompanyNames = new Set();

    page.on("response", async (response) => {
      const url = response.url();
      if (url.includes("/Activity/401") && response.request().method() === "GET") {
        try {
          const json = await response.json();
          const companies = Object.values(json).filter(
            (entry) => entry && typeof entry === "object" && entry.Company
          );
          for (const entry of companies) {
            if (!seenCompanyNames.has(entry.Company)) {
              seenCompanyNames.add(entry.Company);
              results.push(entry);
              console.log(`→ Added: ${entry.Company} (total: ${results.length})`);
            }
          }
        } catch (err) {
          console.warn("Failed to parse FGAS response JSON:", err.message);
        }
      }
    });

    // Fill in search inputs
    if (companyName) {
      await inputFrame.waitForSelector('input[aria-label="Company Name"]', { visible: true });
      await inputFrame.type('input[aria-label="Company Name"]', companyName);
    }

    if (city) {
      await inputFrame.waitForSelector('input[aria-label="City"]', { visible: true });
      await inputFrame.type('input[aria-label="City"]', city);
    }

    // Click search button and wait for first response
    await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes("/Activity/401") && res.request().method() === "GET",
        { timeout: 15000 }
      ),
      inputFrame.click('button.q-btn.bg-primary'),
    ]);
  
    // Pagination loop
    let keepPaginating = true;
    while (keepPaginating) {
      if (results.length >= numberOfRecords) break;

      await new Promise((resolve) => setTimeout(resolve, 5000)); // wait for results listener to populate

      if (results.length >= numberOfRecords) break;

      const nextBtnHandle = await paginationFrame.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button.q-btn'));
        return buttons.find(btn => {
          const i = btn.querySelector('i');
          return i && i.textContent.trim() === 'keyboard_arrow_right';
        }) || null;
      });

      if (!nextBtnHandle || !nextBtnHandle.asElement()) {
        console.log("No more Next button or it's disabled.");
        break;
      }

  await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/Activity/401") && res.request().method() === "GET",
      { timeout: 15000 }
    ),
    nextBtnHandle.asElement().click(),
  ]);

  // Give it a moment to populate
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

    const normalized = results.slice(0, numberOfRecords).map((entry) =>
      normalizeCompany(entry, "fgas")
    );

    res.json({ source: "fgas", normalized });
  } catch (err) {
    console.error("FGAS Puppeteer Error:", err.message);
    next(err);
  } finally {
    if (browser) await browser.close();
  }
};
