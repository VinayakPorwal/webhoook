const chromium = require("@sparticuz/chromium");
const playwright = require("playwright-core");

async function getPNRDetails(pnrNumber) {
  try {
    // Launch browser with Sparticuz Chromium
    const browser = await playwright.chromium.launch({
      executablePath: await chromium.executablePath(),
      args: chromium.args, // Required arguments for Sparticuz Chromium
      headless: true, // Optimized headless mode
    });

    // Create new context and page
    const context = await browser.newContext();
    const page = await context.newPage();

    // Navigate to confirmtkt PNR status page with dynamic PNR
    await page.goto(`https://www.confirmtkt.com/pnr-status/${pnrNumber}`);

    // Wait for results to load
    await page.waitForSelector("#passenger-info-container");

    // Extract PNR details
    const pnrDetails = await page.evaluate(() => {
      const details = {};

      // Get train details
      const trainInfo = document.querySelector(".train-info");
      if (trainInfo) {
        details.trainNumber = trainInfo
          .querySelector(".train-number")
          ?.textContent?.trim();
        details.trainName = trainInfo
          .querySelector(".train-name")
          ?.textContent?.trim();
      }

      // Get journey details
      const journeyInfo = document.querySelector(".journey-info");
      if (journeyInfo) {
        details.dateOfJourney = journeyInfo
          .querySelector(".date")
          ?.textContent?.trim();
        details.fromStation = journeyInfo
          .querySelector(".source")
          ?.textContent?.trim();
        details.toStation = journeyInfo
          .querySelector(".destination")
          ?.textContent?.trim();
      }

      // Get passenger status
      let detailsText = "";

      // Add train details
      if (details.trainNumber && details.trainName) {
        detailsText += `Train: ${details.trainNumber} - ${details.trainName}\n`;
      }

      // Add journey details
      if (details.dateOfJourney && details.fromStation && details.toStation) {
        detailsText += `Journey: ${details.fromStation} to ${details.toStation} on ${details.dateOfJourney}\n\n`;
      }

      // Add passenger details
      detailsText += "Passenger Details:\n";
      const passengerRows = document.querySelectorAll(
        "#passenger-info-container tbody tr"
      );
      passengerRows.forEach((row, index) => {
        detailsText += `Passenger ${index + 1}:\n`;
        detailsText += `Seat/Berth: ${
          row.querySelector("td:nth-child(1) span")?.textContent?.trim() || "N/A"
        }\n`;
        detailsText += `Current Status: ${
          row.querySelector("td:nth-child(2) span:first-child")
            ?.textContent?.trim() || "N/A"
        }\n`;
        detailsText += `Prediction: ${
          row.querySelector("td:nth-child(2) span:last-child")
            ?.textContent?.trim() || "N/A"
        }\n`;
        detailsText += `Booking Status: ${
          row.querySelector("td:nth-child(3) span")?.textContent?.trim() ||
          "N/A"
        }\n`;
        detailsText += `Coach Position: ${
          row.querySelector("td:nth-child(4) span")?.textContent?.trim() ||
          "N/A"
        }\n\n`;
      });

      return detailsText.trim();
    });

    // Close browser
    await browser.close();

    return pnrDetails;
  } catch (error) {
    console.error("Error fetching PNR details:", error);
    throw error;
  }
}

module.exports = { getPNRDetails };


getPNRDetails("8807965647").then((pnrDetails) => {
  console.log(pnrDetails);
});
