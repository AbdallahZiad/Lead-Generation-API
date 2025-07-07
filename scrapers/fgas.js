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
      // Minimal changes: Add essential arguments for containerized environments
      args: [
        "--no-sandbox", // Crucial for security in containers
        "--disable-setuid-sandbox", // Also crucial for security
        "--disable-gpu", // Often needed for headless Linux environments without a GPU
        "--disable-dev-shm-usage", // VITAL for limited shared memory in Docker/Railway containers
      ],
      // Increase launch timeout, as browser startup can be slower on remote hosts
      timeout: 30000, // Increased from default (30s suggested, could go to 60s if needed)
    });

    const page = await browser.newPage();
    // Minimal change: Increase default navigation timeout for all page operations
    await page.setDefaultNavigationTimeout(60000); // 60 seconds (was 30s by default)

    await page.goto("https://fgasregister.com/company-directory/", {
      waitUntil: "networkidle2",
    });

    // Find iframe with inputs & pagination
    // Minimal change: Increase timeout for iframe selector
    await page.waitForSelector('iframe[src*="sites.shocklogic.com/FGAS/directory"]', { timeout: 30000 }); // Was 15s implicit
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
          // Minimal change: Check if response is OK before parsing JSON
          if (!response.ok()) {
            console.warn(`FGAS API response for ${url} was not OK: ${response.status()}`);
            return; // Don't try to parse non-OK responses
          }
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
      await inputFrame.waitForSelector('input[aria-label="Company Name"]', { visible: true, timeout: 20000 }); // Increased timeout
      await inputFrame.type('input[aria-label="Company Name"]', companyName);
    }

    if (city) {
      await inputFrame.waitForSelector('input[aria-label="City"]', { visible: true, timeout: 20000 }); // Increased timeout
      await inputFrame.type('input[aria-label="City"]', city);
    }

    // Click search button and wait for first response
    await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes("/Activity/401") && res.request().method() === "GET",
        { timeout: 30000 } // Minimal change: Increased timeout for response
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
          // Minimal change: Explicitly check for disabled state on the button
          return i && i.textContent.trim() === 'keyboard_arrow_right' && !btn.disabled && !btn.classList.contains('q-btn--disabled');
        }) || null;
      });

      if (!nextBtnHandle || !nextBtnHandle.asElement()) {
        console.log("No more Next button or it's disabled.");
        break;
      }

      await Promise.all([
        page.waitForResponse(
          (res) => res.url().includes("/Activity/401") && res.request().method() === "GET",
          { timeout: 30000 } // Minimal change: Increased timeout for response
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